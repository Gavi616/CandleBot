import { sendCharacterGenStep, swapTraits, swapBrinks } from './chargen.js';
import { saveGameData, getGameData, getVirtualTableOrder, askForTraits, askForMoment,
  askForBrink, sendCandleStatus, askForCharacterInfo, getDMResponse, sendDM,
  handleTraitStacking, askForVoicePreference, startReminderTimers, clearReminderTimers
} from './utils.js';
import { client } from './index.js';
import { gameStartMessage, startingMessageGM, startingMessagePlayer, stepOneMessage,
  stepTwoMessage, stepThreeMessage, stepFourMessage, stepFiveMessage, stepSixMessage,
  stepSevenMessage, stepSevenReminder, stepEightMessage
} from './config.js';
import { ChannelType } from 'discord.js';

export async function prevStep(message) {
  const channelId = message.channel.id;
  const game = getGameData(channelId);

  if (!game) {
    message.channel.send('There is no game in progress in this channel.');
    return;
  }

  if (game.gmId !== message.author.id) {
    try {
      await message.author.send({ content: 'Only the GM can use this command.' });
      await message.delete();
    } catch (error) {
      console.error(`Failed to delete message in <#${channelId}>: ${error.message}`);
    }

    saveGameData();
    return;
  }
  
  if (game.characterGenStep <= 1) {
    message.channel.send('Cannot go back further than Step 1.');
    return;
  }

  game.characterGenStep--;
  saveGameData();
  const gameChannel = message.guild.channels.cache.get(game.textChannelId);
  sendCharacterGenStep(gameChannel, game);
}

export async function handleStepOne(gameChannel, game) {
  game.traitsRequested = true;
  gameChannel.send(stepOneMessage);
  sendCandleStatus(gameChannel, 3);
  await new Promise(resolve => setTimeout(resolve, 5000));
  startReminderTimers(gameChannel, game);
  const traitPromises = [];
  for (const playerId of game.playerOrder) {
    const message = await gameChannel.messages.fetch({ limit: 1 }).then(messages => messages.first());
    traitPromises.push(askForTraits(message, gameChannel, game, playerId));
  }
  await Promise.all(traitPromises);
  const swappedTraits = await swapTraits(client, game.players, game, game.guildId);
  game.players = swappedTraits;
  clearReminderTimers(game);
  game.characterGenStep++;
  saveGameData();
  gameChannel.send('Traits have now been swapped.\nPlayers, check your DMs and look over the Virtue and Vice you have received.');
  await new Promise(resolve => setTimeout(resolve, 3000));
  sendCharacterGenStep(gameChannel, game);
}

export async function handleStepTwo(gameChannel, game) {
  gameChannel.send(stepTwoMessage);
}

export async function handleStepThree(gameChannel, game) {
  gameChannel.send(stepThreeMessage);
  await new Promise(resolve => setTimeout(resolve, 5000));
  startReminderTimers(gameChannel, game);
  await getCharacterInfo(gameChannel, gameChannel.id);
  clearReminderTimers(game);
  game.characterGenStep++;
  saveGameData();
  sendCharacterGenStep(gameChannel, game);
}

export async function handleStepFour(gameChannel, game) {
  gameChannel.send(stepFourMessage);
  sendCandleStatus(gameChannel, 6);
  await new Promise(resolve => setTimeout(resolve, 5000));
  startReminderTimers(gameChannel, game);
  const momentPromises = game.playerOrder.map(async (playerId) => {
    const player = await gameChannel.guild.members.fetch(playerId);
    const user = player.user;
    await askForMoment(user, game, playerId, TRAIT_TIMEOUT);
  });
  await Promise.all(momentPromises);
  clearReminderTimers(game);
  game.characterGenStep++;
  saveGameData();
  sendCharacterGenStep(gameChannel, game);
}

export async function handleStepFive(gameChannel, game) {
  gameChannel.send(stepFiveMessage);
  sendCandleStatus(gameChannel, 9);
  await new Promise(resolve => setTimeout(resolve, 5000));
  startReminderTimers(gameChannel, game);
  let brinkOrder = getVirtualTableOrder(game, true);
  brinkOrder = brinkOrder.filter(participantId => game.players[participantId] || participantId === game.gmId);
  const threatPlayerId = brinkOrder[(brinkOrder.indexOf(game.gmId) + 1) % brinkOrder.length];

  await gameChannel.guild.members.fetch();

  const brinkPromises = brinkOrder.map(async (participantId) => {
    const member = gameChannel.guild.members.cache.get(participantId);
    const participant = member.user;

    let prompt;
    let isThreat = false;

    if (participantId === threatPlayerId) {
      prompt = 'Write a phrase to follow, “I have seen *them*..” & give a detail about the threat without outright identifying them.';
      isThreat = true;
    } else if (participantId === game.gmId) {
      prompt = 'Write a phrase to follow, “I have seen *them*..” & give a detail about the threat without outright identifying them.';
      isThreat = true;
    } else {
      const nextParticipantId = brinkOrder[(brinkOrder.indexOf(participantId) + 1) % brinkOrder.length];
      const nextPlayer = game.players[nextParticipantId];
      if (nextPlayer) {
        const nextCharacterName = nextPlayer.name || nextPlayer.playerUsername || "Someone";
        prompt = `Write a phrase to follow, “I have seen you..” & a detail about what you saw ${nextCharacterName} do in a moment of desperation.`;
      } else {
        console.error(`No next player found after ${participantId}.`);
        return;
      }
    }
    await askForBrink(participant, game, participantId, prompt, BRINK_TIMEOUT, isThreat);
  });

  await Promise.all(brinkPromises);

  const swappedBrinks = swapBrinks(game.players, game.playerOrder, game.gmId);
  game.players = swappedBrinks;
  const brinkSwapPromises = game.playerOrder.map(async (playerId) => {
    try {
      const player = await gameChannel.guild.members.fetch(playerId);
      const user = player.user;
      await sendDM(user, `Your Brink is: ${swappedBrinks[playerId].brink}.`);
    } catch (error) {
      console.error(`Error DMing player ${playerId} for swapped brink:`, error);
      gameChannel.send(`Could not DM player ${playerId} for swapped brink.`);
    }
  });

  await Promise.all(brinkSwapPromises);

  try {
    const gm = await gameChannel.guild.members.fetch(game.gmId);
    const user = gm.user;
    await user.send(`Your Brink is: ${swappedBrinks[game.gmId].brink}.`);
  } catch (error) {
    console.error(`Error DMing GM ${game.gmId} for swapped brink:`, error);
    gameChannel.send(`Could not DM the GM for swapped brink.`);
  }
  clearReminderTimers(game);
  game.characterGenStep++;
  saveGameData();
  sendCharacterGenStep(gameChannel, game);
}

export async function handleStepSix(gameChannel, game) {
  gameChannel.send(stepSixMessage);
  await new Promise(resolve => setTimeout(resolve, 5000));
  startReminderTimers(gameChannel, game);
  const stackPromises = [];
  for (const playerId of game.playerOrder) {
    const player = await gameChannel.guild.members.fetch(playerId);
    const user = player.user;
    stackPromises.push(handleTraitStacking(user, game, playerId));
  }
  await Promise.all(stackPromises);
  saveGameData();
}

export async function handleStepSeven(gameChannel, game) {
  gameChannel.send(stepSevenMessage);
  sendCandleStatus(gameChannel, 10);
  await new Promise(resolve => setTimeout(resolve, 5000));
  startReminderTimers(gameChannel, game);
  gameChannel.send(stepSevenReminder);
  const gearPromises = [];
  for (const playerId of game.playerOrder) {
    const player = await gameChannel.guild.members.fetch(playerId);
    const user = player.user;
    gearPromises.push(user.send('Please use `.gear item1, item2, ...` to input your gear.'));
  }
  await Promise.all(gearPromises);
  saveGameData();
}

export async function handleStepEight(gameChannel, game) {
  gameChannel.send(stepEightMessage);
  await new Promise(resolve => setTimeout(resolve, 5000));
  startReminderTimers(gameChannel, game);
  const players = game.players;
  const gameMode = game.gameMode;

  const finalRecordingPromises = Object.keys(players).map(async (userId) => {
    try {
      const user = await client.users.fetch(userId);
      if (gameMode === "text-only") {
        await sendDM(user, 'Please record your final message for the world, in character. Send it via DM as a text message.');
      } else {
        await sendDM(user, 'Please record your final message for the world, in character. Send it via DM as an audio message (mobile app only) or a text message.');
      }
      const member = gameChannel.guild.members.cache.get(userId);
      const voiceChannelId = game.voiceChannelId;
      const voiceChannel = client.channels.cache.get(voiceChannelId);
      if (gameMode === "voice-plus-text" && voiceChannel && member.voice.channelId === voiceChannelId) {
        try {
          const ttsConsent = await requestConsent(user, 'Would you like to use Text to Speech to read your final message aloud at the appropriate time during the session?', 'tts_consent_yes', 'tts_consent_no', 60000, 'Text-to-Speech Consent');
          if (ttsConsent) {
            await askForVoicePreference(user, game, userId, 600000);
          }
        } catch (error) {
          console.error(`Error during TTS consent or voice preference for user ${userId}:`, error);
          gameChannel.send(`An error occurred during TTS consent or voice preference for <@${userId}>.`);
        }
      }
    } catch (error) {
      console.error(`Error DMing user ${userId}:`, error);
      gameChannel.send(`Could not DM user ${userId} for final recordings.`);
    }
  });

  await Promise.all(finalRecordingPromises);
  clearReminderTimers(game);
  game.characterGenStep++;
  saveGameData();
  sendCharacterGenStep(gameChannel, game);
}

export async function handleStepNine(gameChannel, game) {
  gameChannel.send(gameStartMessage);
  game.dicePool = 10;
  game.scene = 1;
  sendCandleStatus(gameChannel, 10);
  await new Promise(resolve => setTimeout(resolve, 5000));
  startReminderTimers(gameChannel, game);
  const commandUsagePromises = game.playerOrder.map(async (playerId) => {
      try {
        const player = await gameChannel.guild.members.fetch(playerId);
        await player.user.send(startingMessagePlayer);
      } catch (error) {
        console.error(`Error DMing player ${playerId}:`, error);
        gameChannel.send(`Could not DM player ${playerId} for command usage message.`);
      }
  });

  try {
    const gm = await gameChannel.guild.members.fetch(game.gmId);
    await gm.user.send(startingMessageGM);
  } catch (error) {
    console.error(`Error DMing GM ${game.gmId}:`, error);
    gameChannel.send(`Could not DM the GM ${game.gmId} for command usage message.`);
  }
  await Promise.all(commandUsagePromises);
  clearReminderTimers(game);
}

async function getCharacterInfo(gameChannel, channelId) {
  const game = getGameData(channelId);
  const playerOrder = game.playerOrder;
  const infoPromises = playerOrder.map(async (playerId) => {
    const player = await gameChannel.guild.members.fetch(playerId);
    const user = player.user;
    await askForCharacterInfo(user, game, playerId, 'name', "What's your character's name or nickname?", 60000);
    await askForCharacterInfo(user, game, playerId, 'look', 'What does your character look like at a quick glance?', 60000);
    await askForCharacterInfo(user, game, playerId, 'concept', 'Briefly, what is your character\'s concept (profession or role)?', 60000);
  });
  await Promise.all(infoPromises);
}
