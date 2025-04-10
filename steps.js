import {
  saveGameData, getGameData, getVirtualTableOrder, askForTraits, askForMoment,
  askForBrink, sendCandleStatus, askForCharacterInfo, getDMResponse, sendDM, displayInventory,
  handleTraitStacking, askForVoicePreference, startReminderTimers, clearReminderTimers
} from './utils.js';
import { client } from './index.js';
import {
  TRAIT_TIMEOUT, BRINK_TIMEOUT, gameStartMessage, startingMessageGM, startingMessagePlayer, stepOneMessage,
  stepTwoMessage, stepThreeMessage, stepFourMessage, stepFiveMessage, stepSixMessage,
  stepSevenMessage, stepSevenReminder, stepEightMessage
} from './config.js';

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

export async function sendCharacterGenStep(gameChannel, game) {
  console.log(`sendCharacterGenStep has been called with step: ${game.characterGenStep}`);
  const step = game.characterGenStep;

  switch (step) {
    case 1:
      await handleStepOne(gameChannel, game);
      break;
    case 2:
      await handleStepTwo(gameChannel, game);
      break;
    case 3:
      await handleStepThree(gameChannel, game);
      break;
    case 4:
      await handleStepFour(gameChannel, game);
      break;
    case 5:
      await handleStepFive(gameChannel, game);
      break;
    case 6:
      await handleStepSix(gameChannel, game);
      break;
    case 7:
      await handleStepSeven(gameChannel, game);
      break;
    case 8:
      await handleStepEight(gameChannel, game);
      break;
    case 9:
      await handleStepNine(gameChannel, game);
      break;
    default:
      console.warn(`Requested an unknown character generation step: ${step}`);
      break;
  }
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
  startReminderTimers(gameChannel, game); // Pass gameChannel and game

  let brinkOrder = getVirtualTableOrder(game, true); // Get order including GM
  // Ensure all participants exist in game data or are the GM
  brinkOrder = brinkOrder.filter(participantId => game.players[participantId] || participantId === game.gmId);

  await gameChannel.guild.members.fetch(); // Cache members

  // --- 1. Collect all givenBrinks (Core Text) ---
  const brinkPromises = brinkOrder.map(async (writerId) => {
      const member = gameChannel.guild.members.cache.get(writerId);
      if (!member) {
          console.error(`handleStepFive: Could not find member ${writerId}`);
          return;
      }
      const writerUser = member.user;

      let prompt;
      let isThreatBrink = false; // Is the brink being written *about* the threat?

      // Determine the recipient and prompt
      const writerIndex = brinkOrder.indexOf(writerId);
      const recipientId = brinkOrder[(writerIndex + 1) % brinkOrder.length];

      if (recipientId === game.gmId) {
          // This writer is writing the Threat Brink for the GM
          prompt = 'Write a phrase to follow, “I have seen *them*..” & give a detail about the threat without outright identifying them.';
          isThreatBrink = true;
      } else {
          // This writer is writing a Player Brink for the next player
          const recipientPlayer = game.players[recipientId];
          const recipientName = recipientPlayer?.name || recipientPlayer?.playerUsername || "Someone";
          prompt = `Write a phrase to follow, “I have seen you..” & a detail about what you saw ${recipientName} do in a moment of desperation.`;
          isThreatBrink = false;
      }
      // askForBrink now saves the sanitized core to game.players[writerId].givenBrink or game.gm.givenBrink
      await askForBrink(writerUser, game, writerId, prompt, BRINK_TIMEOUT, isThreatBrink);
  });

  await Promise.all(brinkPromises);
  console.log("handleStepFive: All givenBrinks collected.");

  // --- 2. Assign and Normalize Brinks (Replaces swapBrinks) ---
  const assignmentPromises = [];
  // Use a standard for loop to ensure sequential fetching if needed, though Promise.all handles concurrency well.
  for (let i = 0; i < brinkOrder.length; i++) {
      const writerId = brinkOrder[i];
      const recipientId = brinkOrder[(i + 1) % brinkOrder.length];

      const writerData = (writerId === game.gmId) ? game.gm : game.players[writerId];
      // Get writer's character name or username, fallback to "The GM"
      const writerName = game.players[writerId]?.name || game.players[writerId]?.playerUsername || "The GM";
      const givenBrinkCore = writerData?.givenBrink; // This is the RAW sanitized core saved in Loop 1

      if (givenBrinkCore === undefined || givenBrinkCore === null) {
          console.error(`handleStepFive: Missing givenBrink for writer ${writerId}. Skipping assignment to ${recipientId}.`);
          continue; // Skip this iteration if the core is missing
      }

      let finalNormalizedBrink; // This will be the recipient's brink
      let writerFormattedGivenBrink; // This will be the writer's "You saw..." sentence
      let recipientUser;
      let recipientNameForSentence; // Name used in the writer's sentence

      try {
           const recipientMember = await gameChannel.guild.members.fetch(recipientId);
           recipientUser = recipientMember.user;
      } catch (error) {
           console.error(`handleStepFive: Error fetching recipient ${recipientId}:`, error);
           continue; // Skip if recipient can't be fetched
      }

      // Determine if the recipient is the GM
      const isRecipientGM = (recipientId === game.gmId);

      // --- A. Create and Save the Recipient's Brink ---
      // Use normalizeBrink to create the sentence the recipient sees
      finalNormalizedBrink = normalizeBrink(givenBrinkCore, writerName, isRecipientGM);

      if (isRecipientGM) {
          // Assigning the Threat Brink TO the GM
          game.gm.brink = finalNormalizedBrink;
          recipientNameForSentence = "*them*"; // For the writer's sentence later
          assignmentPromises.push(sendDM(recipientUser, `Your Brink (from ${writerName}) is: ${finalNormalizedBrink}`));
      } else {
          // Assigning a Player Brink TO a player
          if (!game.players[recipientId]) game.players[recipientId] = {}; // Ensure recipient player object exists
          game.players[recipientId].brink = finalNormalizedBrink;
          // Get recipient's name for the writer's sentence
          const recipientPlayerData = game.players[recipientId];
          recipientNameForSentence = recipientPlayerData?.name || recipientPlayerData?.playerUsername || "Someone";
          assignmentPromises.push(sendDM(recipientUser, `Your Brink (from ${writerName}) is: ${finalNormalizedBrink}`));
      }
      console.log(`handleStepFive: Assigned Recipient Brink from ${writerId} to ${recipientId}: "${finalNormalizedBrink}"`);

      // --- B. Create and Overwrite the Writer's givenBrink ---
      // Now that the raw core has been used, format the sentence for the WRITER
      writerFormattedGivenBrink = `You saw ${recipientNameForSentence} ${givenBrinkCore}`;
      // Ensure it ends with a period
      if (!writerFormattedGivenBrink.endsWith('.')) {
          writerFormattedGivenBrink += '.';
      }

      // Overwrite the writer's givenBrink with the formatted sentence
      if (writerId === game.gmId) {
          game.gm.givenBrink = writerFormattedGivenBrink;
      } else {
          // Ensure writer player object exists (should, but safety check)
          if (!game.players[writerId]) game.players[writerId] = {};
          game.players[writerId].givenBrink = writerFormattedGivenBrink;
      }
      console.log(`handleStepFive: Overwrote Writer ${writerId}'s givenBrink with: "${writerFormattedGivenBrink}"`);

  } // End of for loop

  await Promise.all(assignmentPromises);
  console.log("handleStepFive: All received Brinks assigned, writer givenBrinks overwritten, and DMs sent.");

  // --- 3. Finalize Step ---
  clearReminderTimers(game);
  game.characterGenStep++;
  saveGameData(); // Save after all assignments and overwrites are done
  sendCharacterGenStep(gameChannel, game); // Proceed to next step
}

export async function handleStepSix(gameChannel, game) {
  gameChannel.send(stepSixMessage);
  await new Promise(resolve => setTimeout(resolve, 5000));
  startReminderTimers(gameChannel, game);

  console.log(`handleStepSix: Calling handleTraitStacking`);
  await handleTraitStacking(game)
  clearReminderTimers(game);
  game.characterGenStep++;
  saveGameData();
  sendCharacterGenStep(gameChannel, game);
}

export async function handleStepSeven(gameChannel, game) {
  gameChannel.send(stepSevenMessage);
  sendCandleStatus(gameChannel, 10);
  await new Promise(resolve => setTimeout(resolve, 5000));
  startReminderTimers(gameChannel, game);
  gameChannel.send(stepSevenReminder);

  // Send instructional DM and display inventory for each player (simultaneously)
  const inventoryPromises = game.playerOrder.map(async (playerId) => {
    const player = await gameChannel.guild.members.fetch(playerId);
    const user = player.user;
    await displayInventory(user, game, playerId);
  });

  await Promise.all(inventoryPromises); // Wait for all DMs to be sent

  saveGameData();
  // Note: Checking if all players are done and advancing to Step 8 is
  // handled within the 'approve' button interaction handler in index.js
  // after the GM confirms every player's starting inventory.
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

export async function swapTraits(client, players, game, guildId) {
  if (typeof guildId !== 'string' || !/^\d{18}$/.test(guildId)) {
    console.error("swapTraits: Invalid guildId format. Check the guildId.");
    return players;
  }
  const playerOrder = getVirtualTableOrder(game, false);

  const swappedPlayers = {};

  for (let i = 0; i < playerOrder.length; i++) {
    const currentPlayerId = playerOrder[i];
    const nextPlayerId = playerOrder[(i + 1) % playerOrder.length];

    swappedPlayers[nextPlayerId] = {
      ...players[nextPlayerId],
      virtue: players[currentPlayerId].virtue,
      vice: players[currentPlayerId].vice,
    };
    if (!swappedPlayers[currentPlayerId]) {
      swappedPlayers[currentPlayerId] = {
        ...players[currentPlayerId],
      };
    }
  }

  const swapTraitPromises = playerOrder.map(async (recipientId, i) => {
    if (typeof recipientId !== 'string' || recipientId.length < 15) {
      console.error("swapTraits: Invalid userId format. Check the recipientId.");
    }
    const senderId = playerOrder[(i - 1 + playerOrder.length) % playerOrder.length];

    try {
      let guild;
      try {
        guild = client.guilds.cache.get(guildId);
      } catch (error) {
        console.error(`swapTraits: client.guilds.cache.get(guildId) Error:`, error);
      }
      if (!guild) {
        console.error("swapTraits: No guild found with that guildId. Check the guildId.");
        return;
      }

      let member;
      try {
        member = await guild.members.fetch(recipientId);
      } catch (error) {
        console.error(`swapTraits: guild.members.fetch(recipientId) Error:`, error);
      }

      if (!member) {
        console.error(`swapTraits: No member found with id ${recipientId} in guild ${guildId}`);
        return;
      }
      const recipientUser = member.user;

      if (!recipientUser) {
        console.error("swapTraits: No user found with that recipientId. Check the recipientId.");
        return;
      }
      const senderName = players[senderId].playerUsername;
      const recipientName = players[recipientId].playerUsername;
      await recipientUser.send(`Your Virtue (from ${senderName}): ${swappedPlayers[recipientId].virtue}\nYour Vice (from ${senderName}): ${swappedPlayers[recipientId].vice}`);
    } catch (error) {
      console.error(`Error sending trait swap DMs to player ${recipientId}:`, error);
    }
  });

  await Promise.all(swapTraitPromises);
  return swappedPlayers;
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
