import { gameData, getVirtualTableOrder, sendCandleStatus, saveGameData, askForTraits, sanitizeString, askForMoment, askForBrink, normalizePlayerBrink, normalizeGMBrink } from './utils.js';
import { TRAIT_TIMEOUT } from './config.js';
import { client, findGameByUserId } from './index.js'

export async function sendCharacterGenStep(gameChannel, game) {
  console.log(`sendCharacterGenStep has been called with step: ${game.characterGenStep}`);
  const step = game.characterGenStep;
  const players = game.players;
  const playerOrder = game.playerOrder;
  const gmId = game.gmId;
  const channelId = game.textChannelId;

  if (step === 1) {
    game.traitsRequested = true;
    gameChannel.send(`\n**Step One: Players Write Traits**\nPlayers, check your DMs and reply with a Virtue and a Vice.`);
    sendCandleStatus(gameChannel, 3);
    const traitPromises = [];
    for (const playerId of playerOrder) {
      const message = await gameChannel.messages.fetch({ limit: 1 }).then(messages => messages.first());
      traitPromises.push(askForTraits(message, gameChannel, game, playerId));
    }
    await Promise.all(traitPromises);
    saveGameData();
  } else if (step === 2) {
    gameChannel.send('**Step Two: GM Introduces the Module / Theme**\nTraits have been swapped (check your DMs and look over what you have received). Write your Virtue and Vice on two index cards. The GM will now introduce the module/theme. *Your GM must use `.nextstep` to continue.*');
    const swappedTraits = await swapTraits(client, players, game, game.guildId);
    game.players = swappedTraits;
    saveGameData();
  } else if (step === 3) {
    gameChannel.send(`**Step Three: Players Create Concepts**\nPlayers, check your DMs and respond with your character\'s Name, Look and Concept, in that order as three separate messages.`);
    const message = await gameChannel.messages.fetch({ limit: 1 }).then(messages => messages.first());
    await askPlayersForCharacterInfo(message, channelId);
    game.characterGenStep++;
    sendCharacterGenStep(gameChannel, game);
  } else if (step === 4) {
    gameChannel.send(`**Step Four: Players Plan Moments**\nMoments are an event that would be reasonable to achieve, kept succinct and clear to provide strong direction. However, all Moments should have potential for failure.`);
    sendCandleStatus(gameChannel, 6);
    const momentPromises = playerOrder.map(async (playerId) => {
        const player = await gameChannel.guild.members.fetch(playerId);
        const user = player.user;
        await askForMoment(user, game, playerId, TRAIT_TIMEOUT);
    });
    await Promise.all(momentPromises);
  } else if (step === 5) {
    gameChannel.send('**Step Five: Players and GM Discover Brinks**\nCheck your DMs for personalized instructions on this step.\nYou have five minutes to respond.');
    sendCandleStatus(gameChannel, 9);
    const brinkOrder = getVirtualTableOrder(game, true);
    const threatPlayerId = brinkOrder[(brinkOrder.indexOf(gmId) + 1) % brinkOrder.length];

    for (const participantId of brinkOrder) {
        const member = gameChannel.guild.members.cache.get(participantId);
        const participant = member.user;
        let prompt;
        if (participantId === threatPlayerId) {
            prompt = 'Write, “I have seen them..” & give a detail about the threat without outright identifying them.';
        } else {
            const nextParticipantId = brinkOrder[(brinkOrder.indexOf(participantId) + 1) % brinkOrder.length];
            const nextParticipantUsername = players[nextParticipantId]?.playerUsername || "the GM";
            prompt = `Please write a short descriptive phrase of when or where you saw the Brink of ${nextParticipantUsername}.`;
        }
        game.brinkResponses = game.brinkResponses || {};
        game.brinkResponses[participantId] = await askForBrink(participant, game, participantId, prompt, TRAIT_TIMEOUT);
    }
  } else if (step === 6) {
    gameChannel.send('**Step Six: Arrange Traits**\nPlayers should now arrange their Traits, Moment, and Brink cards. Your Brink must go on the bottom of the stack, face down. *Your GM must use `.nextstep` to continue.*');
    const swappedBrinks = swapBrinks(players, playerOrder, gmId);
    gameData[channelId].players = swappedBrinks;
    const brinkSwapPromises = playerOrder.map(async (playerId) => {
        try {
          const player = await gameChannel.guild.members.fetch(playerId);
          const user = player.user;
          await user.send(`Your swapped Brink is: ${swappedBrinks[playerId].brink}\nPlease write it on an index card.`);
        } catch (error) {
          console.error(`Error DMing player ${playerId} for swapped brink:`, error);
          gameChannel.send(`Could not DM player ${playerId} for swapped brink.`);
        }
    });

    await Promise.all(brinkSwapPromises);

    try {
        const gm = await gameChannel.guild.members.fetch(gmId);
        const user = gm.user;
        await user.send(`Your "I have seen them.." is: ${swappedBrinks[gmId].brink}\nPlease write it on an index card.`);
    } catch (error) {
      console.error(`Error DMing GM ${gmId} for swapped brink:`, error);
      gameChannel.send(`Could not DM the GM for swapped brink.`);
    }
    saveGameData();
  } else if (step === 7) {
    gameChannel.send('**Step Seven: Inventory Supplies**\nYour character has whatever items you have in your pockets (or follow your GM\'s instructions, if provided). *Your GM must use `.nextstep` to continue.*\n**It begins.**');
    sendCandleStatus(gameChannel, 10);
  } else if (step === 8) {
    gameChannel.send('**Final Recordings**\nPlayers, please check your DMs for instructions on sending your final recordings.');

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
            } else {
              await user.send('Please record your final message for the world, in character. Send it via DM as an audio file or a text message.');
            }
          } catch (error) {
            console.error(`Error DMing user ${userId}:`, error);
            gameChannel.send(`Could not DM user ${userId} for final recordings.`);
          }
        })()
      );
    }
    await Promise.all(finalRecordingPromises);
  } else if (step === 9) {
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
    gameData[channelId].dicePool = 10;
    gameData[channelId].scene = 1;
    sendCandleStatus(gameChannel, 10);
    const commandUsagePromises = playerOrder.map(async (playerId) => {
        try {
          const player = await gameChannel.guild.members.fetch(playerId);
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
    Dice Pools Refresh: The Players’ pool of dice refills to the number of lit candles. The Players’ pool of dice refills to the number of lit candles. The GM’s pool equals the number of unlit candles.`;
          await player.user.send(playerMessage);
        } catch (error) {
          console.error(`Error DMing player ${playerId}:`, error);
          gameChannel.send(`Could not DM player ${playerId} for command usage message.`);
        }
    });

    try {
      const gm = await gameChannel.guild.members.fetch(gmId);
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
      gameChannel.send(`Could not DM the GM ${gmId} for command usage message.`);
    }
    await Promise.all(commandUsagePromises);
  }
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

      await recipientUser.send(`You received the Virtue "${swappedPlayers[recipientId].virtue}" from <@${senderId}>.`);
      await recipientUser.send(`You received the Vice "${swappedPlayers[recipientId].vice}" from <@${senderId}>.`);
    } catch (error) {
      console.error(`Error sending trait swap DMs to player ${recipientId}:`, error);
    }
  });

  await Promise.all(swapTraitPromises);
  return swappedPlayers;
}

export function swapBrinks(players, playerOrder, gmId) {
  const swappedPlayers = { ...players };

  for (let i = 0; i < playerOrder.length; i++) {
    const currentPlayerId = playerOrder[i];
    const nextPlayerId = playerOrder[(i + 1) % playerOrder.length];
    const characterName = players[currentPlayerId].name || "Unknown"; //Get the current player's name.
    swappedPlayers[nextPlayerId] = {
      ...swappedPlayers[nextPlayerId],
      brink: normalizePlayerBrink(players[currentPlayerId].brink, characterName) //Use the current player's brink and name.
    };
  }

  const penultimatePlayerId = playerOrder[playerOrder.length - 1];
  const characterName = players[gmId].name || "Unknown"; //Get the GM's name.
  swappedPlayers[gmId] = {
    ...swappedPlayers[gmId],
    brink: normalizeGMBrink(players[penultimatePlayerId].brink, characterName) //Use the penultimate player's brink, but the GM's name.
  };

  return swappedPlayers;
}

export async function handleCharacterGenStep1DM(message, game) {
  if (!game.traitsRequested) {
    return;
  }

  const userId = message.author.id;
  const players = game.players;

  const [virtue, vice] = message.content.split(',').map(s => s.trim());

  if (!virtue || !vice) {
    try {
      await message.reply('Invalid format. Please provide both your Virtue and Vice, separated by a comma (e.g., "Courageous, Greedy"). You may try again.');
    } catch (error) {
      console.error(`Error replying to player ${userId}:`, error);
    }
    return; // Exit early if input is invalid
  }
  
  if (virtue.length === 0 || vice.length === 0) {
    try {
      await message.reply('Invalid format. Please provide both your Virtue and Vice, separated by a comma (e.g., "Courageous, Greedy"). You may try again.');
    } catch (error) {
      console.error(`Error replying to player ${userId}:`, error);
    }
    return; // Exit early if input is invalid
  }

  players[userId].virtue = sanitizeString(virtue);
  players[userId].vice = sanitizeString(vice);
  try {
    await message.reply('Traits recorded!');
  } catch (error) {
    console.error(`Error replying to player ${userId}:`, error);
  }
  const allTraitsReceived = Object.values(players).every(player => player.virtue && player.vice);
  if (allTraitsReceived) {
      const channelId = game.textChannelId;
      const gameChannel = client.channels.cache.get(channelId);
      if (gameChannel) {
          game.characterGenStep++;
          sendCharacterGenStep(gameChannel, channelId);
          saveGameData();
      }
  }
}

export async function handleCharacterGenStep4DM(message, game) {
  const userId = message.author.id;
  const players = game.players;
  const input = message.content.trim();

  if (!input) {
    try {
      await message.reply('Invalid input. Please provide a non-empty value for your Moment.');
    } catch (error) {
      console.error(`Error replying to player ${userId}:`, error);
    }
    return;
  }

  players[userId].moment = sanitizeString(input);
  try {
    await message.reply('Moment received!');
  } catch (error) {
    console.error(`Error replying to player ${userId}:`, error);
  }
  const allMomentsReceived = Object.values(players).every(player => player.moment);
  if (allMomentsReceived) {
    const channelId = game.textChannelId;
    const gameChannel = client.channels.cache.get(channelId);
    if (gameChannel) {
        game.characterGenStep++;
        sendCharacterGenStep(gameChannel, channelId);
        saveGameData();
    }
  }
}

export async function handleCharacterGenStep5DM(message, game) {
  const userId = message.author.id;
  const players = game.players;
  const fullPlayerOrder = getVirtualTableOrder(game, true);
  const gmId = game.gmId;
  const input = message.content.trim();

  if (!input) {
    try {
      await message.reply('Invalid input. Please provide a non-empty value for your Brink.');
    } catch (error) {
      console.error(`Error replying to player ${userId}:`, error);
    }
    return;
  }

  const brinkResponses = game.brinkResponses || {};
  brinkResponses[userId] = sanitizeString(input);
  game.brinkResponses = brinkResponses;

  const allBrinksReceived = Object.keys(brinkResponses).length === fullPlayerOrder.length;

  if (allBrinksReceived) {
    const threatPlayerId = fullPlayerOrder[fullPlayerOrder.length - 2];
    for (const playerId of fullPlayerOrder) {
      if (playerId === gmId) {
        game.gm.brink = brinkResponses[gmId];
      }
      else if (playerId === threatPlayerId) {
        players[playerId].brink = brinkResponses[threatPlayerId];
      } else {
        const nextPlayerId = fullPlayerOrder[(fullPlayerOrder.indexOf(playerId) + 1) % fullPlayerOrder.length];
        players[playerId].brink = brinkResponses[nextPlayerId];
      }
    }
    const channelId = game.textChannelId;
    const gameChannel = client.channels.cache.get(channelId);
    if (gameChannel) {
        gameChannel.send('Brinks have been distributed. Proceeding to the next step.');
        game.characterGenStep++;
        sendCharacterGenStep(gameChannel, channelId);
        saveGameData();
    }
  }
}

export async function handleCharacterGenStep6DM(message, game) {
  const channelId = game.textChannelId;
  const gameChannel = client.channels.cache.get(channelId);
  if (gameChannel) {
      game.characterGenStep++;
      sendCharacterGenStep(gameChannel, channelId);
      saveGameData();
  }
}

export async function handleCharacterGenStep8DM(message, game) {
  const userId = message.author.id;
  const players = game.players;
  const input = message.content.trim();

  if (!input) {
    try {
      await message.reply('Invalid input. Please provide a non-empty value for your Recording.');
    } catch (error) {
      console.error(`Error replying to player ${userId}:`, error);
    }
    return;
  }

  if (!players[userId].recordings) {
    players[userId].recordings = "";
  }

  players[userId].recording = input;

  const allRecordingsReceived = Object.values(players).every(player => player.recording);
  if (allRecordingsReceived) {
    const channelId = game.textChannelId;
    const gameChannel = client.channels.cache.get(channelId);
    if (gameChannel) {
        game.characterGenStep++;
        sendCharacterGenStep(gameChannel, channelId);
        saveGameData();
    }
  }
}