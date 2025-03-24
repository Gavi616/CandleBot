import {
  sendCharacterGenStep,
  swapTraits,
  swapBrinks,
} from './chargen.js';
import {
  saveGameData,
  getGameData,
  getVirtualTableOrder,
  askForTraits,
  askForMoment,
  askForBrink,
  sendCandleStatus,
  askPlayerForCharacterInfoWithRetry,
  getDMResponse,
  sendDM,
  sanitizeString,
  normalizePlayerBrink,
  normalizeGMBrink,
  handleTraitStacking
} from './utils.js';
import { client } from './index.js';
import { TRAIT_TIMEOUT, BRINK_TIMEOUT } from './config.js';

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

async function askPlayersForCharacterInfo(message, channelId) {
  const game = getGameData(channelId);
  const playerOrder = game.playerOrder;
  const infoPromises = playerOrder.map(async (playerId) => {
    const player = await message.guild.members.fetch(playerId);
    const user = player.user;
    await askPlayerForCharacterInfoWithRetry(user, game, playerId, 'name', "What's your character's name or nickname?", 60000);
    await askPlayerForCharacterInfoWithRetry(user, game, playerId, 'look', 'What does your character look like at a quick glance?', 60000);
    await askPlayerForCharacterInfoWithRetry(user, game, playerId, 'concept', 'Briefly, what is your character\'s concept (profession or role)?', 60000);
  });
  await Promise.all(infoPromises);
}

export async function handleStepOne(gameChannel, game) {
  game.traitsRequested = true;
  gameChannel.send(`\n**Step One: Players Write Traits**\nPlayers, check your DMs and reply with a Virtue and a Vice.`);
  sendCandleStatus(gameChannel, 3);
  await new Promise(resolve => setTimeout(resolve, 5000));
  const traitPromises = [];
  for (const playerId of game.playerOrder) {
    const message = await gameChannel.messages.fetch({ limit: 1 }).then(messages => messages.first());
    traitPromises.push(askForTraits(message, gameChannel, game, playerId));
  }
  await Promise.all(traitPromises);
  const swappedTraits = await swapTraits(client, game.players, game, game.guildId);
  game.players = swappedTraits;
  game.characterGenStep++;
  saveGameData();
  gameChannel.send('Traits have now been swapped. Players, check your DMs and look over the Virtue and Vice you have received.');
  await new Promise(resolve => setTimeout(resolve, 5000));
  sendCharacterGenStep(gameChannel, game);
}

export async function handleStepTwo(gameChannel, game) {
  gameChannel.send('**Step Two: GM Introduces this session\'s Module / Theme**\nThe GM will now introduce the module/theme and then use `.theme [description]` to advance to Step Three');
}

export async function handleStepThree(gameChannel, game) {
  gameChannel.send(`**Step Three: Players Create Concepts**\nPlayers, expect a DM and respond with your character\'s Name, Look and Concept, in that order as three separate messages.`);
  await new Promise(resolve => setTimeout(resolve, 5000));
  await askPlayersForCharacterInfo(message, gameChannel.id);
  game.characterGenStep++;
  sendCharacterGenStep(gameChannel, game);
}

export async function handleStepFour(gameChannel, game) {
  gameChannel.send(`**Step Four: Players Plan Moments**\nMoments are an event that would be reasonable to achieve, kept succinct and clear to provide strong direction. However, all Moments should have potential for failure.`);
  sendCandleStatus(gameChannel, 6);
  await new Promise(resolve => setTimeout(resolve, 5000));
  const momentPromises = game.playerOrder.map(async (playerId) => {
      const player = await gameChannel.guild.members.fetch(playerId);
      const user = player.user;
      await askForMoment(user, game, playerId, TRAIT_TIMEOUT);
  });
  await Promise.all(momentPromises);
}

export async function handleStepFive(gameChannel, game) {
  gameChannel.send(`**Step Five: Players and GM Discover Brinks**\nCheck your DMs for personalized instructions on this step.`);
  sendCandleStatus(gameChannel, 9);
  await new Promise(resolve => setTimeout(resolve, 5000));
  const brinkOrder = getVirtualTableOrder(game, true);
  const threatPlayerId = brinkOrder[(brinkOrder.indexOf(game.gmId) + 1) % brinkOrder.length];

  for (const participantId of brinkOrder) {
      const member = gameChannel.guild.members.cache.get(participantId);
      const participant = member.user;
      let prompt;
      if (participantId === threatPlayerId) {
          prompt = 'Write, “I have seen them..” & give a detail about the threat without outright identifying them.';
      } else {
          const nextParticipantId = brinkOrder[(brinkOrder.indexOf(participantId) + 1) % brinkOrder.length];
          const nextParticipantUsername = game.players[nextParticipantId]?.playerUsername || "the GM";
          prompt = `Please write a short descriptive phrase of when or where you saw the Brink of ${nextParticipantUsername}.`;
      }
      game.brinkResponses = game.brinkResponses || {};
      game.brinkResponses[participantId] = await askForBrink(participant, game, participantId, prompt, BRINK_TIMEOUT);
  }

  const swappedBrinks = swapBrinks(game.players, game.playerOrder, game.gmId);
  game.players = swappedBrinks;
  const brinkSwapPromises = game.playerOrder.map(async (playerId) => {
      try {
        const player = await gameChannel.guild.members.fetch(playerId);
        const user = player.user;
        await sendDM(user, `Your "I have seen them.." is: ${swappedBrinks[game.gmId].brink}\nPlease write it on an index card.`);
      } catch (error) {
        console.error(`Error DMing player ${playerId} for swapped brink:`, error);
        gameChannel.send(`Could not DM player ${playerId} for swapped brink.`);
      }
  });

  await Promise.all(brinkSwapPromises);

  try {
      const gm = await gameChannel.guild.members.fetch(game.gmId);
      const user = gm.user;
      await user.send(`Your "I have seen them.." is: ${swappedBrinks[game.gmId].brink}\nPlease write it on an index card.`);
  } catch (error) {
    console.error(`Error DMing GM ${game.gmId} for swapped brink:`, error);
    gameChannel.send(`Could not DM the GM for swapped brink.`);
  }
  saveGameData();
}

export async function handleStepSix(gameChannel, game) {
  gameChannel.send('**Step Six: Arrange Trait Stacks**\nPlayers should now arrange their Traits, Moment, and Brink cards. Your Brink must go on the bottom of the stack, face down. See your DMs to confirm your stack order.');
  await new Promise(resolve => setTimeout(resolve, 5000));
  const stackPromises = [];
  for (const playerId of game.playerOrder) {
    const player = await gameChannel.guild.members.fetch(playerId);
    const user = player.user;
    stackPromises.push(handleTraitStacking(user, game, playerId));
  }
  await Promise.all(stackPromises);
}

export async function handleStepSeven(gameChannel, game) {
  gameChannel.send('**Step Seven: Inventory Supplies**\nYour character has whatever items you have in your pockets (or follow your GM\'s instructions, if provided). See your DMs to input your gear.');
  sendCandleStatus(gameChannel, 10);
  await new Promise(resolve => setTimeout(resolve, 5000));
  gameChannel.send('**It begins.**\n\n*For the remainder of the session, you should endeavor to act in-character.*');
  const gearPromises = [];
  for (const playerId of game.playerOrder) {
    const player = await gameChannel.guild.members.fetch(playerId);
    const user = player.user;
    gearPromises.push(user.send('Please use `.gear gear item1, item2, ...` to input your gear.'));
  }
  await Promise.all(gearPromises);
}

export async function handleStepEight(gameChannel, game) {
  gameChannel.send('**Final Recordings**\nPlayers, please check your DMs for instructions on sending your final recordings.');
  await new Promise(resolve => setTimeout(resolve, 5000));
  const players = game.players;
  const gameMode = game.gameMode;

  const finalRecordingPromises = [];
  for (const userId in players) {
    finalRecordingPromises.push(
      (async () => {
        try {
          const user = await client.users.fetch(userId);
          if (gameMode === "text-only") {
            await sendDM(user, 'Please record your final message for the world, in character. Send it via DM as a text message.');
          } else {
            await sendDM(user, 'Please record your final message for the world, in character. Send it via DM as an audio file or a text message.');
          }
        } catch (error) {
          console.error(`Error DMing user ${userId}:`, error);
          gameChannel.send(`Could not DM user ${userId} for final recordings.`);
        }
      })()
    );
  }
  await Promise.all(finalRecordingPromises);
}

export async function handleStepNine(gameChannel, game) {
  gameChannel.send(
    '**Game Start**\n' +
    'Character generation is complete! Ten candles are lit, and the game begins.\n\n' +
    '**How to Use `.conflict`:**\n' +
    'Use the `.conflict` command to perform actions. Use modifiers such as `-burnvirtue`, `-burnvice` and `-burnmoment` as needed.\n' +
    'Buring a Virtue or Vice from the top of your stack allows your `.conflict` to reroll all ones.\n' +
    'Buring your Moment from the top of your stack will give you a valuable Hope die if the `.conflict` succeeds!\n' +
    'Example(s): `.conflict` or `.conflict -burnvice`\n\n' +
    'Candles will be extinguished as the scenes progress.'
  );
  game.dicePool = 10;
  game.scene = 1;
  sendCandleStatus(gameChannel, 10);
  await new Promise(resolve => setTimeout(resolve, 5000));
  const commandUsagePromises = game.playerOrder.map(async (playerId) => {
      try {
        const player = await gameChannel.guild.members.fetch(playerId);
        const playerMessage = `**Ten Candles Game Mechanics**
  Resolving a Conflict: Use \`.conflict\` after you have declared the action you'd like to take to roll the communal dice pool. If at least one die lands on 6 the conflict is successful. Any dice that come up 1 are removed until the scene ends. A candle is darkened if no 6s appear on a conflict roll (after any appropriate Traits are burned).
  Burning Traits: A trait can be burned in order to reroll all dice which come up 1 in a conflict.
  Moment: If you live your Moment successfully, gain a Hope Die to add to your conflict rolls.
  Hope Die: A Hope Die succeeds on a 5 or a 6.
  Brink: After all else has burned away, whenever you embrace your Brink, reroll all dice. If the conflict roll still fails, you lose your Hope die (if you had one).
  Dire Conflicts: The GM may decide that a particular conflict roll will be dire. If they do so, you may either withdraw their action or press onward. If you press onward a success is handled normally, but a failure may result in permanent damage to your character (mental or physical).
  Narration Rights: If you rolled more 6’s than the GM, you may describe what happens as a result of the conflict. Keep the narration simple, reasonable, and interesting. Remember: you aren’t playing to win, but to tell a good story. If the GM tied your roll or rolled more 6’s, the GM may describe what happens as a result of the conflict. If you fail a conflict roll, you may take over narration at any time, but the cost is your character's life.
  Darkening Candles: Whenever a candle is darkened for any reason, the current scene ends and Changing Scenes events happen before a new scene begins. Once darkened, candles may never be relit. When no lit candles remain, the game enters The Last Stand.
  Changing Scenes: Any time a candle darkens and a new scene begins, three events occur.
  Transition: The GM transitions out of the failed conflict roll and scene. This should be brief so as not to close off too many player avenues.
  Establishing Truths:
  These things are true. The world is dark.
  Establish # truths equal to lit candles.
  Truths are irrefutable facts pertaining to a single change in the story. (e.g. "Billy began convulsing on the floor and then suddenly stopped.", "Our flashlights illuminated the water, but there were no waves." or "We filled the pickup’s tank by mouth-siphoning gas from cars on the highway".
  After the last truth everyone left alive speaks, “and we are alive.”
  Dice Pools Refresh: The Players’ pool of dice refills to the number of lit candles. The Players’ pool of dice refills to the number of lit candles. The GM’s pool equals the number of unlit candles.`;
        await player.user.send(playerMessage);
      } catch (error) {
        console.error(`Error DMing player ${playerId}:`, error);
        gameChannel.send(`Could not DM player ${playerId} for command usage message.`);
      }
  });

  try {
    const gm = await gameChannel.guild.members.fetch(game.gmId);
    const gmMessage = `**Ten Candles Game Mechanics**
Resolving a Conflict: Players use \`.conflict\` to roll a communal dice pool. If at least one die lands on 6 the conflict is successful. Any dice that come up 1 are removed until the scene ends. A candle is darkened if no 6s appear on a conflict roll (after any appropriate Traits are burned).
Burning Traits: A player may burn a Trait to reroll all dice which come up 1 in a conflict.
Moment: If a player lives their Moment successfully, they gain a Hope Die to add to their conflict rolls.
Hope Die: A Hope Die succeeds on a 5 or a 6.
Brink: After all else has burned away, whenever a player embraces their Brink, they reroll all dice. If the conflict roll still fails, they lose their Hope die (if they had one).
Dire Conflicts: You may decide that a particular conflict roll will be dire. The player may either withdraw their action or press onward. If they press onward a success is handled normally, but a failure may result in permanent damage to the character (mental or physical).
Narration Rights: If the player rolled more 6’s than you (the GM), that player may describe what happens as a result of the conflict. Keep the narration simple, reasonable, and interesting. Remember: you aren’t playing to win, but to tell a good story. If you (the GM) tied the player's roll or rolled more 6’s than the player, you (the GM) may describe what happens as a result of the conflict. A player who fails a conflict roll may take over narration at any time, the cost is their character's life.
Darkening Candles: Whenever a candle is darkened for any reason, the current scene ends and Changing Scenes events happen before a new scene begins. Once darkened, candles may never be relit. When no lit candles remain, the game enters The Last Stand.
Changing Scenes: Any time a candle darkens and a new scene begins, three events occur.
Transition: You (the GM) transition the players out of the failed conflict roll and scene. This should be brief so as not to close off too many player avenues.
Establishing Truths:
These things are true. The world is dark.
Establish # truths equal to lit candles.
Truths are irrefutable facts pertaining to a single change in the story. (e.g. "Billy began convulsing on the floor and then suddenly stopped"; "Our flashlights illuminated the water, but there were no waves."; or "We filled the pickup’s tank by mouth-siphoning gas from cars on the highway").
After the last truth everyone left alive speaks, “and we are alive.”
Dice Pools Refresh: The Players’ pool of dice refills to the number of lit candles. The GM’s pool equals the number of unlit candles.`;
    await gm.user.send(gmMessage);
  } catch (error) {
    console.error(`Error DMing GM ${game.gmId}:`, error);
    gameChannel.send(`Could not DM the GM ${game.gmId} for command usage message.`);
  }
  await Promise.all(commandUsagePromises);
}
