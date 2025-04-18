import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import {
  saveGameData, getGameData, getVirtualTableOrder, askForTraits, askForMoment,
  askForBrink, sendCandleStatus, askForCharacterInfo, getDMResponse, sendDM, displayInventory,
  handleTraitStacking, askForVoicePreference, startReminderTimers, clearReminderTimers
} from './utils.js';
import { client } from './index.js';
import {
  TRAIT_TIMEOUT, BRINK_TIMEOUT, BOT_PREFIX, gameStartMessage, startingMessageGM, startingMessagePlayer,
  stepOneMessage, stepTwoMessage, stepThreeMessage, stepFourMessage, stepFiveMessage, stepSixMessage,
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
  await gameChannel.send(stepOneMessage); // "Players, check your DMs..."
  sendCandleStatus(gameChannel, 3);
  await new Promise(resolve => setTimeout(resolve, 5000)); // Pause before DMs

  startReminderTimers(gameChannel, game); // Start GM reminders

  const traitPromises = [];
  for (const playerId of game.playerOrder) {
    try {
      const member = await gameChannel.guild.members.fetch(playerId);
      const user = member.user;
      // Call the NEW askForTraits which handles the modal flow internally
      traitPromises.push(askForTraits(user, game, playerId));
    } catch (error) {
      console.error(`handleStepOne: Error fetching member or starting askForTraits for ${playerId}:`, error);
      // Handle error for this player - maybe assign random traits directly?
      game.players[playerId].virtue = getRandomVirtue();
      game.players[playerId].vice = getRandomVice();
      traitPromises.push(Promise.resolve({ // Resolve promise so Promise.all doesn't fail
          virtue: game.players[playerId].virtue,
          vice: game.players[playerId].vice
      }));
      await gameChannel.send(`⚠️ Error contacting <@${playerId}> for traits. Random traits assigned.`).catch(console.error);
    }
  }

  // Wait for all players to complete the modal/confirmation/timeout flow
  await Promise.all(traitPromises);
  console.log("handleStepOne: All players finished trait input/assignment.");

  // --- Perform Trait Swap ---
  console.log("handleStepOne: Swapping traits...");
  // Pass game.players directly, swapTraits modifies a copy and returns it
  const swappedPlayersData = await swapTraits(client, game.players, game, game.guildId);
  // Overwrite the player data in the main game object with the swapped data
  Object.assign(game.players, swappedPlayersData);
  console.log("handleStepOne: Traits swapped.");

  // --- Finalize Step ---
  clearReminderTimers(game); // Stop GM reminders
  game.characterGenStep++;
  saveGameData(); // Save the game state with swapped traits

  await new Promise(resolve => setTimeout(resolve, 3000)); // Pause before message
  await gameChannel.send('Traits have now been swapped.\nPlayers, check your DMs and look over the Virtue and Vice you have received.');
  await new Promise(resolve => setTimeout(resolve, 3000)); // Pause before next step message

  sendCharacterGenStep(gameChannel, game); // Proceed to Step 2
}

export async function handleStepTwo(gameChannel, game) {
  // 1. Send the message to the game channel as before
  await gameChannel.send(stepTwoMessage); // "GM will now introduce the module/theme..."

  await new Promise(resolve => setTimeout(resolve, 5000)); // Pause before DMs (like other steps)

  // 2. Send a DM to the GM with a button to start the theme process
  try {
    const gmMember = await gameChannel.guild.members.fetch(game.gmId);
    const gmUser = gmMember.user;

    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`set_theme_button_${game.textChannelId}`) // Unique ID including channel
          .setLabel('Set Game Theme')
          .setStyle(ButtonStyle.Primary)
      );

    await sendDM(gmUser, {
      content: `It's time to set the theme for your **Ten Candles** session in <#${game.textChannelId}>. Click the button below to enter the theme details.`,
      components: [row]
    });
    console.log(`handleStepTwo: Sent 'Set Theme' button DM to GM ${gmUser.tag} for game ${game.textChannelId}`);

    // Start reminder timers for the GM to interact with the button/modal
    startReminderTimers(gameChannel, game);

  } catch (error) {
    console.error(`handleStepTwo: Failed to fetch GM or send DM for game ${game.textChannelId}:`, error);
  }
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

  const brinkOrder = getVirtualTableOrder(game, true); // Get order including GM
  await gameChannel.guild.members.fetch(); // Cache members

  const collectedBrinkCores = {}; // Store { writerId: coreText }

  console.log("handleStepFive: --- Collecting Brink Cores ---");
  // --- 1. Collect all Brink Cores ---
  const collectionPromises = brinkOrder.map(async (writerId) => {
    const member = gameChannel.guild.members.cache.get(writerId);
    if (!member) {
      console.error(`handleStepFive (Collect): Could not find member ${writerId}`);
      return;
    }
    const writerUser = member.user;

    // Determine the recipient and prompt
    const writerIndex = brinkOrder.indexOf(writerId);
    const recipientId = brinkOrder[(writerIndex + 1) % brinkOrder.length]; // Neighbor to the LEFT
    const isRecipientGM = (recipientId === game.gmId);
    const isThreatBrink = isRecipientGM; // Threat brink is written *for* the GM

    let prompt;
    if (isThreatBrink) {
      // This writer (player to GM's right) is writing the Threat Brink for the GM
      prompt = 'Write a phrase to follow, “I have seen *them*..” & give a detail about the threat without outright identifying them.';
    } else {
      // This writer is writing a Player Brink for the next player
      const recipientPlayer = game.players[recipientId];
      const recipientName = recipientPlayer?.name || recipientPlayer?.playerUsername || "Someone";
      prompt = `Write a phrase to follow, “I have seen you..” & a detail about what you saw ${recipientName} do in a moment of desperation.`;
    }

    // askForBrink gets the RAW, SANITIZED core text
    const coreText = await askForBrink(writerUser, game, writerId, prompt, BRINK_TIMEOUT, isThreatBrink);
    if (coreText !== null) {
      collectedBrinkCores[writerId] = coreText;
      console.log(`handleStepFive (Collect): Collected core "${coreText}" from ${writerId}`);
    } else {
      console.error(`handleStepFive (Collect): Failed to collect core from ${writerId}`);
      // Handle timeout/error case - maybe assign random core here?
      const randomCore = getRandomBrink(isThreatBrink);
      collectedBrinkCores[writerId] = sanitizeString(randomCore);
      console.log(`handleStepFive (Collect): Assigned random core "${collectedBrinkCores[writerId]}" to ${writerId} due to error/timeout.`);
    }
  });

  await Promise.all(collectionPromises);
  console.log("handleStepFive: --- All Brink Cores Collected ---");
  console.log("Collected Cores:", collectedBrinkCores);

  // --- 2. Assign Formatted Brinks and Overwrite givenBrinks ---
  console.log("handleStepFive: --- Assigning Formatted Brinks ---");
  const assignmentPromises = [];

  for (let i = 0; i < brinkOrder.length; i++) {
    const writerId = brinkOrder[i];
    const recipientId = brinkOrder[(i + 1) % brinkOrder.length]; // Neighbor to the LEFT

    const writerData = (writerId === game.gmId) ? game.gm : game.players[writerId];
    const recipientData = (recipientId === game.gmId) ? game.gm : game.players[recipientId];

    if (!writerData || !recipientData) {
        console.error(`handleStepFive (Assign): Missing data for writer ${writerId} or recipient ${recipientId}. Skipping.`);
        continue;
    }

    // Get the CORE text written BY the writer (collected in step 1)
    const givenBrinkCore = collectedBrinkCores[writerId];

    if (givenBrinkCore === undefined || givenBrinkCore === null) {
      console.error(`handleStepFive (Assign): Missing collected core for writer ${writerId}. Skipping assignment to ${recipientId}.`);
      continue;
    }

    // Get writer's name (observer)
    // IMPORTANT: If GM is the writer, the observer name for the player's brink should be "Someone"
    const writerName = (writerId === game.gmId)
        ? "Someone"
        : (game.players[writerId]?.name || game.players[writerId]?.playerUsername || "Someone");

    // Get recipient's name (for the writer's givenBrink sentence)
    const recipientName = (recipientId === game.gmId)
        ? "*them*" // Use "*them*" when the recipient is the GM
        : (game.players[recipientId]?.name || game.players[recipientId]?.playerUsername || "Someone");

    const isRecipientGM = (recipientId === game.gmId);
    const isThreatBrinkBeingAssigned = isRecipientGM; // The brink being assigned *is* a threat brink if recipient is GM

    // --- A. Create and Save the Recipient's FINAL `brink` ---
    // Use normalizeBrink to create the sentence the recipient receives. The observer is the writerName (which is "Someone" if GM wrote it).
    const finalRecipientBrink = normalizeBrink(givenBrinkCore, writerName, isThreatBrinkBeingAssigned);

    recipientData.brink = finalRecipientBrink; // Assign to recipient's `brink` field
    console.log(`handleStepFive (Assign): Assigned Recipient Brink to ${recipientId}: "${finalRecipientBrink}" (Writer: ${writerId}, Observer: ${writerName})`);

    // Send DM to recipient with their final Brink
    try {
        const recipientMember = await gameChannel.guild.members.fetch(recipientId);
        assignmentPromises.push(sendDM(recipientMember.user, `Your Brink (from ${writerName}) is: ${finalRecipientBrink}`));
    } catch (error) {
        console.error(`handleStepFive (Assign): Error fetching/DMing recipient ${recipientId}:`, error);
    }

    // --- B. Create and Overwrite the WRITER'S `givenBrink` ---
    // This stores the sentence *they* wrote, for their own reference. Use the *actual* writer name here, even if it's the GM's username.
    const actualWriterName = game.players[writerId]?.name || game.players[writerId]?.playerUsername || (writerId === game.gmId ? (gm.nickname || gm.user.username) : "Someone");

    let writerFormattedGivenBrink;
    if (isRecipientGM) { // If the writer wrote about the threat
        writerFormattedGivenBrink = `${actualWriterName} has seen ${recipientName} ${givenBrinkCore}`; // recipientName is "*them*" here
    } else { // If the writer wrote about another player
        writerFormattedGivenBrink = `${actualWriterName} saw ${recipientName} ${givenBrinkCore}`;
    }
    // Ensure it ends with a period
    if (!writerFormattedGivenBrink.endsWith('.')) {
        writerFormattedGivenBrink += '.';
    }

    writerData.givenBrink = writerFormattedGivenBrink; // Overwrite writer's `givenBrink`
    console.log(`handleStepFive (Assign): Overwrote Writer ${writerId}'s givenBrink with: "${writerFormattedGivenBrink}"`);

  } // End of for loop

  await Promise.all(assignmentPromises);
  console.log("handleStepFive: --- All Brinks Assigned and DMs Sent ---");

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
  if (typeof guildId !== 'string' || !/^\d{18,}$/.test(guildId)) {
    console.error("swapTraits: Invalid guildId format. Check the guildId.");
    return players; // Return original players on error
  }
  const playerOrder = getVirtualTableOrder(game, false); // Get only players

  // Create a deep copy to avoid modifying the original object during iteration
  const swappedPlayers = JSON.parse(JSON.stringify(players));

  const swapTraitPromises = [];

  for (let i = 0; i < playerOrder.length; i++) {
    const currentPlayerId = playerOrder[i];
    const leftNeighborId = playerOrder[(i + 1) % playerOrder.length]; // Player to the left
    const rightNeighborId = playerOrder[(i - 1 + playerOrder.length) % playerOrder.length]; // Player to the right

    // Ensure player data exists before accessing
    if (!players[currentPlayerId] || !swappedPlayers[leftNeighborId] || !swappedPlayers[rightNeighborId]) {
        console.error(`swapTraits: Missing player data for current (${currentPlayerId}), left (${leftNeighborId}), or right (${rightNeighborId}). Skipping swap involving this player.`);
        continue;
    }

    // --- Assign Traits ---
    // Virtue goes LEFT (Current player gives Virtue to Left Neighbor)
    swappedPlayers[leftNeighborId].virtue = players[currentPlayerId].virtue;
    // Vice goes RIGHT (Current player gives Vice to Right Neighbor)
    swappedPlayers[rightNeighborId].vice = players[currentPlayerId].vice;

    // --- Prepare DM ---
    // The recipient (leftNeighborId) gets the Virtue from currentPlayerId (their right neighbor)
    // The recipient (leftNeighborId) gets the Vice from the player to *their* left (leftNeighborId's left neighbor)
    const leftOfLeftNeighborId = playerOrder[(i + 2) % playerOrder.length];

    // Ensure data exists for DM message generation
    const virtueSourcePlayer = players[currentPlayerId];
    const viceSourcePlayer = players[leftOfLeftNeighborId];
    const recipientPlayer = players[leftNeighborId]; // Use original data for names

    if (!virtueSourcePlayer || !viceSourcePlayer || !recipientPlayer) {
        console.error(`swapTraits (DM Prep): Missing player data for DM to ${leftNeighborId}.`);
        continue;
    }

    const virtueSourceUsername = virtueSourcePlayer.playerUsername || `Player ${currentPlayerId}`;
    const viceSourceUsername = viceSourcePlayer.playerUsername || `Player ${leftOfLeftNeighborId}`;
    const recipientUsername = recipientPlayer.playerUsername || `Player ${leftNeighborId}`; // For logging

    // Fetch the recipient user object to send the DM
    swapTraitPromises.push(
      (async () => {
        try {
          const guild = await client.guilds.fetch(guildId); // Fetch guild
          const member = await guild.members.fetch(leftNeighborId); // Fetch member within guild
          const recipientUser = member.user;

          // Construct the correct DM message
          const dmMessage = `Trait Swap Complete:\n` +
                            `Your **Virtue** (from ${virtueSourceUsername}): **${swappedPlayers[leftNeighborId].virtue}**\n` +
                            `Your **Vice** (from ${viceSourceUsername}): **${swappedPlayers[leftNeighborId].vice}**`;

          await sendDM(recipientUser, dmMessage);
          console.log(`swapTraits: Sent swapped traits DM to ${recipientUsername} (${leftNeighborId}). Virtue from ${currentPlayerId}, Vice from ${leftOfLeftNeighborId}.`);

        } catch (error) {
          console.error(`swapTraits: Error fetching member or sending trait swap DM to player ${leftNeighborId}:`, error);
          // Attempt to notify GM or log error prominently
          const gameChannel = client.channels.cache.get(game.textChannelId);
          if (gameChannel) {
            await gameChannel.send(`⚠️ Error sending swapped traits DM to <@${leftNeighborId}>. They may need to check manually or ask the GM.`).catch(console.error);
          }
        }
      })()
    );
  } // End for loop

  await Promise.all(swapTraitPromises);
  console.log("swapTraits: All swap DMs attempted.");
  return swappedPlayers; // Return the object with correctly assigned traits
}

async function getCharacterInfo(gameChannel, channelId) {
  const game = getGameData(channelId);
  if (!game) {
      console.error(`getCharacterInfo: Could not find game data for channel ${channelId}`);
      return;
  }
  const playerOrder = game.playerOrder;

  // Use a sequential loop for each player
  for (const playerId of playerOrder) {
    try {
      const member = await gameChannel.guild.members.fetch(playerId);
      const user = member.user;

      console.log(`getCharacterInfo: Asking ${user.tag} for Name...`);
      // Pass the prompt string as the 5th argument, TRAIT_TIMEOUT as the 6th
      await askForCharacterInfo(user, game, playerId, 'name', "What's your character's name or nickname?", TRAIT_TIMEOUT);

      console.log(`getCharacterInfo: Asking ${user.tag} for Look...`);
      await askForCharacterInfo(user, game, playerId, 'look', 'What does your character look like at a quick glance?', TRAIT_TIMEOUT);

      console.log(`getCharacterInfo: Asking ${user.tag} for Concept...`);
      await askForCharacterInfo(user, game, playerId, 'concept', 'Briefly, what is your character\'s concept (profession or role)?', TRAIT_TIMEOUT);

      console.log(`getCharacterInfo: Finished info collection for ${user.tag}`);

    } catch (error) {
        console.error(`getCharacterInfo: Error collecting info for player ${playerId}:`, error);
        await gameChannel.send(`⚠️ An error occurred while collecting character info for <@${playerId}> (Reason: ${error.message}). They may need to provide it manually or the GM might need to intervene.`).catch(console.error);
        // For now, log and continue
    }
  }
  console.log(`getCharacterInfo: Finished info collection for all players in game ${channelId}`);
}
