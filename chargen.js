import { gameData, client } from './index.js';
import { sanitizeString, sendCandleStatus, saveGameData } from './utils.js';
import { TRAIT_TIMEOUT } from './config.js';

const defaultVirtues = [
  'Courageous', 'Compassionate', 'Just', 'Wise', 'Temperate', 'Hopeful', 'Faithful', 'Loving', 'Loyal', 'Honest',
  'Generous', 'Patient', 'Diligent', 'Forgiving', 'Kind', 'Optimistic', 'Reliable', 'Respectful', 'Selfless', 'Sincere',
  'Tolerant', 'Trustworthy', 'Understanding', 'Vigilant', 'Witty', 'Adaptable', 'Ambitious', 'Charitable', 'Creative', 'Decisive'
];

const defaultVices = [
  'Greedy', 'Wrathful', 'Envious', 'Slothful', 'Proud', 'Gluttonous', 'Lustful', 'Treacherous', 'Deceitful', 'Cowardly',
  'Jealous', 'Malicious', 'Pessimistic', 'Reckless', 'Resentful', 'Rude', 'Selfish', 'Stubborn', 'Suspicious', 'Vain',
  'Vengeful', 'Wasteful', 'Withdrawn', 'Arrogant', 'Bitter', 'Careless', 'Cruel', 'Dishonest', 'Frivolous', 'Hateful'
];

const defaultMoments = [
  "Find a way to signal for help.",
  "Locate a safe place to rest.",
  "Protect a vulnerable person.",
  "Discover the source of the strange noises.",
  "Retrieve a lost item of importance.",
  "Find a way to communicate with the outside world.",
  "Repair a broken piece of equipment.",
  "Find a hidden cache of supplies.",
  "Escape from a dangerous location.",
  "Provide light in the darkness to help a friend."
];

export async function sendCharacterGenStep(message, channelId) {
  console.log(`sendCharacterGenStep has been called with step: ${gameData[channelId].characterGenStep}`);
  const step = gameData[channelId].characterGenStep;
  const players = gameData[channelId].players;
  const playerOrder = gameData[channelId].playerOrder;
  const gmId = gameData[channelId].gmId;
  const timeoutInMinutes = TRAIT_TIMEOUT / 60000; // Convert milliseconds to minutes for the timeout message

  if (step === 1) {
    gameData[channelId].traitsRequested = true;
    message.channel.send(`\n**Step One: Players Write Traits (light three candles)**\nPlayers, check your DMs and reply with a Virtue and a Vice.\nYou have ${timeoutInMinutes} minutes to complete this step.`);
    sendCandleStatus(message, 3);
    saveGameData();
    const traitPromises = [];
    for (const playerId of playerOrder) {
      traitPromises.push(askForTraits(message, gameData[channelId], playerId));
    }
    await Promise.all(traitPromises);
  } else if (step === 2) {
    message.channel.send('**Step Two: GM Introduces the Module / Theme**\nTraits have been swapped (check your DMs and look over what you have received). Write your Virtue and Vice on two index cards. The GM will now introduce the module/theme. *Your GM must use `.nextstep` to continue.*');
    const swappedTraits = await swapTraits(players, gameData[channelId], message.guild); //Correctly pass the guild object.
    gameData[channelId].players = swappedTraits;
    saveGameData();
  } else if (step === 3) {
    message.channel.send(`**Step Three: Players Create Concepts**\nPlayers, check your DMs and respond with your character\'s Name, Look and Concept, in that order as three separate messages.\nYou have 5 minutes to complete this step.`);
    await askPlayersForCharacterInfo(message, channelId);
    gameData[channelId].characterGenStep++;
    saveGameData();
    sendCharacterGenStep(message, channelId);
  } else if (step === 4) {
    message.channel.send('**Step Four: Players Plan Moments (light three more candles)**\nMoments are an event that would be reasonable to achieve, kept succinct and clear to provide strong direction. However, all Moments should have potential for failure.\nYou have ${timeoutInMinutes} minutes to respond.');

    sendCandleStatus(message, 6);
    const momentPromises = playerOrder.map(async (playerId) => {
      try {
        const player = await message.guild.members.fetch(playerId);
        const user = player.user;
        const dmChannel = await user.createDM();
        await user.send('Please DM me your Moment.');

        const filter = m => m.author.id === playerId;
        const collected = await dmChannel.awaitMessages({ filter, max: 1, time: TRAIT_TIMEOUT, errors: ['time'] });

        if (collected.size > 0) {
          gameData[channelId].players[playerId].moment = collected.first().content;
        } else {
          assignRandomMoment(user, gameData[channelId].players[playerId]);
        }
      } catch (error) {
        console.error(`Error handling Moment for player ${playerId}:`, error);
        const player = await message.guild.members.fetch(playerId);
        const user = player.user;
        assignRandomMoment(user, gameData[channelId].players[playerId]);
      }
    });
    await Promise.all(momentPromises);
    saveGameData();
  } else if (step === 5) {
    message.channel.send('**Step Five: Players and GM Discover Brinks (light three more candles)**\nCheck your DMs for personalized instructions on this step.\nYou have five minutes to respond.');
    sendCandleStatus(message, 9);
    const players = gameData[channelId].players;
    const playerOrder = gameData[channelId].playerOrder;
    const gmId = gameData[channelId].gmId;

    // Select the last player in the table order before the GM for the Threat detail
    const threatPlayerId = playerOrder[playerOrder.length - 1];

    // Send DM prompts to players
    for (const playerId of playerOrder) {
      const player = message.guild.members.cache.get(playerId);
      let prompt;
      if (playerId === threatPlayerId) {
        prompt = 'Write, “I have seen them..” & give a detail about the threat without outright identifying them.';
      } else {
        const nextPlayerId = playerOrder[(playerOrder.indexOf(playerId) + 1) % playerOrder.length];
        const nextPlayerUsername = players[nextPlayerId].playerUsername;
        prompt = `Please write a short descriptive phrase of when or where you saw the Brink of ${nextPlayerUsername}.`;
      }

      try {
        await player.user.send(prompt);
      } catch (error) {
        console.error(`Error DMing player ${playerId}:`, error);
      }
    }

    // Send DM prompt to GM
    try {
      const gm = message.guild.members.cache.get(gmId);
      const threatPlayerUsername = players[threatPlayerId].playerUsername;
      await gm.user.send(`Please DM me a short descriptive phrase of when or where (and who) saw the Brink of ${threatPlayerUsername}.`);
    } catch (error) {
      console.error(`Error DMing GM ${gmId}:`, error);
    }
  } else if (step === 6) {
    message.channel.send('**Step Six: Arrange Traits**\nPlayers should now arrange their Traits, Moment, and Brink cards. Your Brink must go on the bottom of the stack, face down. *Your GM must use `.nextstep` to continue.*');
    const swappedBrinks = swapBrinks(players, playerOrder, gmId);
    gameData[channelId].players = swappedBrinks;
    saveGameData();
    const brinkSwapPromises = playerOrder.map(async (playerId) => {
      try {
        const player = await message.guild.members.fetch(playerId);
        const user = player.user;
        await user.send(`Your swapped Brink is: ${swappedBrinks[playerId].brink}\nPlease write it on an index card.`);
      } catch (error) {
        console.error(`Error DMing player ${playerId} for swapped brink:`, error);
        message.channel.send(`Could not DM player ${playerId} for swapped brink.`); //Inform the channel.
      }
    });

    await Promise.all(brinkSwapPromises);

    try {
      const gm = await message.guild.members.fetch(gmId);
      const user = gm.user;
      await user.send(`Your "I have seen them.." is: ${swappedBrinks[playerOrder[0]].brink}\nPlease write it on an index card.`);
    } catch (error) {
      console.error(`Error DMing GM ${gmId} for swapped brink:`, error);
      message.channel.send(`Could not DM the GM for swapped brink.`);//Inform the channel.
    }
  } else if (step === 7) {
    message.channel.send('**Step Seven: Inventory Supplies (light the final candle)**\nYour character has whatever items you have in your pockets (or follow your GM\'s instructions, if provided). *Your GM must use `.nextstep` to continue.*\n**It begins.**');
    sendCandleStatus(message, 10);
  } else if (step === 8) {
    message.channel.send('**Final Recordings**\nPlayers, please check your DMs for instructions on sending your final recordings.');

    const players = gameData[channelId].players;
    const gameMode = gameData[channelId].gameMode;

    const finalRecordingPromises = [];
    for (const userId in players) {
      finalRecordingPromises.push(
        (async () => {
          try {
            const user = await client.users.fetch(userId);
            if (gameMode === "text-only") {
              await user.send('Please record your final message for the world, in character. Send it via DM as a text message.');
            } else { // Assuming "voice-plus-text" is the only other option
              await user.send('Please record your final message for the world, in character. Send it via DM as an audio file or a text message.');
            }
          } catch (error) {
            console.error(`Error DMing user ${userId}:`, error);
            message.channel.send(`Could not DM user ${userId} for final recordings.`);//Inform the channel.
          }
        })()
      );
    }
    await Promise.all(finalRecordingPromises);
  } else if (step === 9) {
    message.channel.send(
      '**Game Start**\n' +
      'Character generation is complete! Ten candles are lit, and the game begins.\n\n' +
      '**How to Use `.conflict`:**\n' +
      'Use the `.conflict` command to perform actions. Use modifiers such as `-burnvirtue`, `-burnvice` and `-burnmoment` as needed.\n' +
      'Buring a Virtue or Vice from the top of your stack allows your `.conflict` to reroll all ones.\n' +
      'Buring your Moment from the top of your stack will give you a valuable Hope die is the `.conflict` succeeds!\n' +
      'Example(s): `.conflict` or `.conflict -burnvice`\n\n' +
      'Candles will be extinguished as the scenes progress.\n\n' +
      '**When to Use `.playrecordings`:**\n' +
      'Once all Player Characters have perished, the GM should use the `.playrecordings` command to play their final messages and close the game session.'
    );
    gameData[channelId].dicePool = 10;
    gameData[channelId].scene = 1;
    saveGameData();
    sendCandleStatus(message, 10);
    // Send command usage messages to players and GM
    const commandUsagePromises = playerOrder.map(async (playerId) => {
      try {
        const player = await message.guild.members.fetch(playerId);
        const playerMessage = `**Mechanics**
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
    Dice Pools Refresh: The Players’ pool of dice refills to the number of lit candles. The GM’s pool equals the number of unlit candles.`;
        await player.user.send(playerMessage);
      } catch (error) {
        console.error(`Error DMing player ${playerId}:`, error);
        message.channel.send(`Could not DM player ${playerId} for command usage message.`);//Inform the channel.
      }
    });

    // Send GM command usage message
    try {
      const gm = await message.guild.members.fetch(gmId);
      const gmMessage = `**Mechanics**
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
Truths are irrefutable facts pertaining to a single change in the story. (e.g. "Billy began convulsing on the floor and then suddenly stopped.", "Our flashlights illuminated the water, but there were no waves." or "We filled the pickup’s tank by mouth-siphoning gas from cars on the highway".
After the last truth everyone left alive speaks, “and we are alive.”
Dice Pools Refresh: The Players’ pool of dice refills to the number of lit candles. The GM’s pool equals the number of unlit candles.`;
      await gm.user.send(gmMessage);
    } catch (error) {
      console.error(`Error DMing GM ${gmId}:`, error);
      message.channel.send(`Could not DM GM ${gmId} for command usage message.`);//Inform the channel.
    }
    await Promise.all(commandUsagePromises);
  }
}

export async function swapTraits(players, game, guild) {
  const playerOrder = getVirtualTableOrder(game, false);
  const swappedPlayers = { ...players };

  for (let i = 0; i < playerOrder.length; i++) {
    const currentPlayerId = playerOrder[i];
    const nextPlayerId = playerOrder[(i + 1) % playerOrder.length];

    swappedPlayers[nextPlayerId].virtue = players[currentPlayerId].virtue;
    swappedPlayers[nextPlayerId].vice = players[currentPlayerId].vice;
  }

  const swapTraitPromises = playerOrder.map(async (recipientId, i) => {
    const senderId = playerOrder[(i - 1 + playerOrder.length) % playerOrder.length];
    try {
      const recipientUser = (await client.guilds.cache.get(game.guildId).members.fetch(recipientId)).user;
      await recipientUser.send(`You received the Virtue "${swappedPlayers[recipientId].virtue}" from <@${senderId}>.`);
      await recipientUser.send(`You received the Vice "${swappedPlayers[recipientId].vice}" from <@${senderId}>.`);
    } catch (error) {
      console.error(`Error sending trait swap DMs to player ${recipientId}:`, error);
    }
  });
  await Promise.all(swapTraitPromises);
  return swappedPlayers;
}

function swapBrinks(players, playerOrder, gmId) {
  const swappedPlayers = { ...players };

  // Swap Brinks for each player
  for (let i = 0; i < playerOrder.length; i++) {
    const currentPlayerId = playerOrder[i];
    const nextPlayerId = playerOrder[(i + 1) % playerOrder.length];
    swappedPlayers[nextPlayerId].brink = players[currentPlayerId].brink;
  }

  // Give the GM the brink of the last player
  swappedPlayers[playerOrder[0]].brink = players[playerOrder[playerOrder.length - 1]].brink;

  return swappedPlayers;
}

export function getVirtualTableOrder(game, withGM = true) {
  if (withGM) {
    return [...game.playerOrder, game.gmId];
  } else {
    return [...game.playerOrder];
  }
}

function assignRandomMoment(user, player) {
  player.moment = defaultMoments[Math.floor(Math.random() * defaultMoments.length)];
  user.send(`You timed out. A random Moment has been assigned: "${player.moment}"`);
}

export async function askPlayersForCharacterInfo(message, channelId) {
  const game = gameData[channelId];
  const playerIds = game.playerOrder;

  for (const playerId of playerIds) {
    try {
      const player = await message.guild.members.fetch(playerId);
      const user = player.user;

      // Ask for Name
      await askPlayerForCharacterInfoWithRetry(user, game, playerId, 'name', "What's your character's name or nickname?");

      // Ask for Look
      await askPlayerForCharacterInfoWithRetry(user, game, playerId, 'look', 'What does your character look like at a quick glance?');

      // Ask for Concept
      await askPlayerForCharacterInfoWithRetry(user, game, playerId, 'concept', 'Briefly, what is your character\'s concept (profession or role)?');

    } catch (error) {
      console.error(`Error requesting character info from player ${playerId}:`, error);
      message.channel.send(`Failed to get character info from player <@${playerId}>. Game cancelled.`);
      delete gameData[channelId];
      saveGameData();
      return;
    }
  }
}

export async function askPlayerForCharacterInfoWithRetry(user, game, playerId, field, question, retryCount = 0) {
  try {
    const dmChannel = await user.createDM();
    await user.send(question);

    const filter = m => m.author.id === playerId;
    const collected = await dmChannel.awaitMessages({ filter, max: 1, time: 60000, errors: ['time'] });

    if (collected.size > 0) {
      const response = collected.first().content;
      game.players[playerId][field] = sanitizeString(response);
      saveGameData();
    } else {
      throw new Error(`Player <@${playerId}> timed out while providing ${field}.`);
    }
  } catch (error) {
    if (retryCount < 3) {
      await user.send(`You timed out. Please provide your ${field} again.`);
      await askPlayerForCharacterInfoWithRetry(user, game, playerId, field, question, retryCount + 1);
    } else {
      throw new Error(`Player <@${playerId}> timed out after multiple retries.`);
    }
  }
}

function getRandomVirtue() {
  return defaultVirtues[Math.floor(Math.random() * defaultVirtues.length)];
}

function getRandomVice() {
  return defaultVices[Math.floor(Math.random() * defaultVices.length)];
}

export async function askForTraits(message, game, playerId) {
  const player = await message.guild.members.fetch(playerId);
  const user = player.user;
  const dmChannel = await user.createDM();

  try {
    await user.send('Please DM me a Virtue and a Vice, separated by a comma (e.g., "Courageous, Greedy").');

    const filter = m => m.author.id === playerId;
    const collected = await dmChannel.awaitMessages({ filter, max: 1, time: 300000, errors: ['time'] });

    if (collected.size > 0) {
      // Player responded in time. `handleCharacterGenStep1DM` will handle the rest.
      return;
    } else {
      // Player timed out. Assign random traits.
      game.players[playerId].virtue = getRandomVirtue();
      game.players[playerId].vice = getRandomVice();
      saveGameData();
      await user.send(`You timed out. Random traits have been assigned: Virtue - ${game.players[playerId].virtue}, Vice - ${game.players[playerId].vice}`);
    }
  } catch (error) {
    console.error(`Error DMing player ${playerId} or assigning random traits:`, error);
  }
}

export async function handleCharacterGenStep1DM(message, game) {
  if (!game.traitsRequested) { //If we have not asked for traits yet, just return.
    return;
  }

  const userId = message.author.id;
  const channelId = Object.keys(gameData).find(key => gameData[key] === game);
  const players = game.players;

  const [virtue, vice] = message.content.split(',').map(s => s.trim());
  if (virtue && vice) {
    players[userId].virtue = sanitizeString(virtue);
    players[userId].vice = sanitizeString(vice);
    saveGameData();
    try {
      await message.reply('Traits recorded! Virtue : ' + players[userId].virtue + ', Vice: ' + players[userId].vice + '.');
    } catch (error) {
      console.error(`Error replying to player ${userId}:`, error);
    }
    const allTraitsReceived = Object.values(players).every(player => player.virtue && player.vice);
    if (allTraitsReceived) {
      const gameChannel = client.channels.cache.get(channelId);
      if (gameChannel) {
        gameData[channelId].characterGenStep++;
        saveGameData();
        sendCharacterGenStep({ channel: gameChannel }, channelId);
      }
    }
  } else {
    try {
      await message.reply('Invalid format. Please provide your Virtue and Vice, separated by a comma (e.g., "Courageous, Greedy"). You may try again.');
    } catch (error) {
      console.error(`Error replying to player ${userId}:`, error);
    }
  }
}

export async function handleCharacterGenStep4DM(message, game) {
  const userId = message.author.id;
  const channelId = Object.keys(gameData).find(key => gameData[key] === game);
  const players = game.players;

  players[userId].moment = sanitizeString(message.content);
  saveGameData();
  try {
    await message.reply('Moment received!');
  } catch (error) {
    console.error(`Error replying to player ${userId}:`, error);
  }
  const allMomentsReceived = Object.values(players).every(player => player.moment);
  if (allMomentsReceived) {
    const gameChannel = client.channels.cache.get(channelId);
    if (gameChannel) {
      gameData[channelId].characterGenStep++;
      saveGameData();
      sendCharacterGenStep({ channel: gameChannel }, channelId);
    }
  }
}

export async function handleCharacterGenStep5DM(message, game) {
  const userId = message.author.id;
  const channelId = Object.keys(gameData).find(key => gameData[key] === game);
  const players = game.players;
  const playerOrder = game.playerOrder;
  const gmId = game.gmId;

  const brinkResponses = game.brinkResponses || {};
  brinkResponses[userId] = sanitizeString(message.content);
  game.brinkResponses = brinkResponses;

  const allBrinksReceived = Object.keys(brinkResponses).length === playerOrder.length + 1;

  if (allBrinksReceived) {
    // Distribute Brinks
    const threatPlayerId = playerOrder.find(id => id in brinkResponses && id !== gmId);
    for (const playerId of playerOrder) {
      if (playerId === threatPlayerId) {
        game.gm.brink = brinkResponses[gmId];
      } else {
        const nextPlayerId = playerOrder[(playerOrder.indexOf(playerId) + 1) % playerOrder.length];
        players[playerId].brink = brinkResponses[nextPlayerId];
      }
    }
    players[threatPlayerId].brink = brinkResponses[threatPlayerId];
    saveGameData();
    const gameChannel = client.channels.cache.get(channelId);
    if (gameChannel) {
      gameChannel.send('Brinks have been distributed. Proceeding to the next step.');
      gameData[channelId].characterGenStep++;
      sendCharacterGenStep({ channel: gameChannel }, channelId);
    }
  }
}

export async function handleCharacterGenStep6DM(message, game) {
  const channelId = Object.keys(gameData).find(key => gameData[key] === game);
  const gameChannel = client.channels.cache.get(channelId);
  if (gameChannel) {
    sendCharacterGenStep({ channel: gameChannel }, channelId);
  }
}

export async function handleCharacterGenStep8DM(message, game) {
  const userId = message.author.id;
  const channelId = Object.keys(gameData).find(key => gameData[key] === game);
  const players = game.players;

  if (!players[userId].recordings) {
    players[userId].recordings = "";
  }

  players[userId].recording = message.content;
  saveGameData();

  const allRecordingsReceived = Object.values(players).every(player => player.recording);
  if (allRecordingsReceived) {
    const gameChannel = client.channels.cache.get(channelId);
    if (gameChannel) {
      gameData[channelId].characterGenStep++;
      saveGameData();
      sendCharacterGenStep({ channel: gameChannel }, channelId);
    }
  }
}