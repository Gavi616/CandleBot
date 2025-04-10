import 'dotenv/config';
import {
  Client, EmbedBuilder, ChannelType, GatewayIntentBits, MessageMentions,
  PermissionsBitField, AttachmentBuilder, MessageFlags, ButtonStyle,
  StringSelectMenuBuilder, ActionRowBuilder, ButtonBuilder, ComponentType
} from 'discord.js';
import fs from 'fs';
import { getHelpEmbed } from './embed.js';
import { BOT_PREFIX, TEST_USER_ID, finalRecordingsMessage } from './config.js';
import {
  loadGameData, saveGameData, printActiveGames, getAudioDuration, getGameData,
  gameData, playAudioFromUrl, playRandomConflictSound, handleEditGearModal,
  speakInChannel, requestConsent, loadBlockUserList, isWhitelisted, handleAddGearModal,
  handleAddGearModalSubmit, isBlockedUser, loadChannelWhitelist, saveChannelWhitelist,
  channelWhitelist, respondViaDM, findGameByUserId, handleTraitStacking, getRandomBrink,
  getRandomMoment, getRandomVice, getRandomVirtue, getRandomName, getRandomLook,
  getRandomConcept, handleDoneButton, handleGMEditButton, handleGMEditModalSubmit,
  handleDeleteGearModal, handleDeleteGearModalSubmit, handleEditGearModalSubmit, displayInventory
} from './utils.js';
import { prevStep } from './steps.js';
import { startGame } from './commands/startgame.js';
import { conflict } from './commands/conflict.js';
import { gameStatus } from './commands/gamestatus.js';
import { removePlayer } from './commands/removeplayer.js';
import { leaveGame } from './commands/leavegame.js';
import { cancelGame } from './commands/cancelgame.js';
import { died } from './commands/died.js';
import { getVoiceConnection, joinVoiceChannel } from '@discordjs/voice';

export const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers, GatewayIntentBits.DirectMessages, GatewayIntentBits.GuildMessageReactions, GatewayIntentBits.GuildVoiceStates] });

const version = '0.9.952a';
const botName = 'Ten Candles Bot';
export const isTesting = false;
let botRestarted = false;

client.once('ready', async () => {
  const startupTimestamp = new Date().toLocaleString();
  console.log(`${botName} (v${version}) is ready @ ${startupTimestamp}`);
  console.log(`Logged in as ${client.user.tag} (${client.user.id})`);

  const serverIds = client.guilds.cache.map(guild => guild.id).join(', ');
  console.log(`${botName} is in ${client.guilds.cache.size} server${client.guilds.cache.size === 1 ? '' : 's'} (${serverIds}).`)

  console.log(`Command prefix is ${BOT_PREFIX}`);
  console.log(`Use ${BOT_PREFIX}help for a list of commands.`);

  if (!fs.existsSync('config.js')) {
    console.error('Configuration file not found. Please create a config.js file or copy one from https://github.com/Gavi616/CandleBot');
    return;
  }

  if (isTesting) {
    console.log('-- Testing Mode Engaged! --');
    await sendTestDM(client, 'Listening for test commands.');
    return;
  }

  loadBlockUserList();
  loadChannelWhitelist();
  loadGameData();
  printActiveGames();

  if (!isTesting) {
    if (Object.keys(gameData).length > 0) {
      botRestarted = true;
      for (const channelId in gameData) {
        const game = gameData[channelId];
        const channel = client.channels.cache.get(channelId);
        if (channel) {
          await channel.send(`**${botName}** has restarted and found one or more games in-progress.`);
          if (game.characterGenStep < 9) {
            await channel.send(`Character generation was in progress.\nRestarting character generation from last successful step.\n*If this occurrs repeatedly, contact the developer and/or consider using \`${BOT_PREFIX}cancelgame\`*`);
            await sendCharacterGenStep(channel, game);
          } else if (game.inLastStand) {
            if (Object.values(game.players).every(player => player.isDead)) {
              if (game.endGame) {
                await channel.send("The game has ended. Restarting **Session Data Management** processes.");
                await cancelGame(channel);
              } else {
                await channel.send("All characters are dead. Restarting the **Final Recordings**.");
                await playRecordings(channel);
              }
            }
          } else if (game.inLastStand) {
            if (Object.values(game.players).every(player => player.isDead)) {
              if (game.endGame) {
                await channel.send("The game has ended. Restarting **Session Data Management** processes.");
                await cancelGame(channel);
              } else {
                await channel.send("All characters are dead. Restarting the **Final Recordings**.");
                await playRecordings(channel);
              }
            } else {
              await gameStatus(channel);
              await channel.send(`We are in **The Last Stand**. GM continues narration until all characters have \`${BOT_PREFIX}died @PlayerId [cause]\``);
            }
          } else {
            await gameStatus(channel);
            await channel.send(`GM continues narration until a Player uses \`${BOT_PREFIX}conflict\` to move the story forward.`);
          }
        }
      }
      botRestarted = false;
    }
  }
});

client.on('interactionCreate', async interaction => {
  // --- Skip Chat Input Commands ---
  if (interaction.isChatInputCommand()) return;

  // --- Button, Modal, Select Menu Handling (Primarily in DMs for Step 7) ---
  if (interaction.isButton() || interaction.isModalSubmit() || interaction.isStringSelectMenu()) {
    const interactorId = interaction.user.id;
    let game = null; // Initialize game to null

    // --- Game Finding Logic ---
    // For most player actions in DMs, find by user ID
    if (!interaction.customId.startsWith('approve_') && !interaction.customId.startsWith('tryagain_')) {
      game = findGameByUserId(interactorId);
    }

    // For GM approval/rejection, the game context comes from the button ID
    if (interaction.isButton() && (interaction.customId.startsWith('approve_') || interaction.customId.startsWith('tryagain_'))) {
      const customIdParts = interaction.customId.split('_');
      const textChannelId = customIdParts[2]; // Expecting format like 'approve_playerId_channelId'
      if (textChannelId) {
        game = getGameData(textChannelId); // Find game using the channel ID
      }
    }
    // For player inventory actions, also verify using channel ID from button if possible
    else if (interaction.isButton() || interaction.isStringSelectMenu()) {
      const customIdParts = interaction.customId.split('_');
      // Find the channel ID, often the last part for player buttons
      const potentialChannelId = customIdParts[customIdParts.length - 1];
      if (/^\d+$/.test(potentialChannelId)) {
        const gameFromChannel = getGameData(potentialChannelId);
        // If we found a game via user ID, ensure it matches the channel context
        if (game && gameFromChannel && game.textChannelId !== gameFromChannel.textChannelId) {
          console.warn(`Interaction ${interaction.id}: Game mismatch between user ID and button channel ID.`);
          // Potentially prioritize game from channel ID if user ID one seems wrong context
          game = gameFromChannel;
        } else if (!game && gameFromChannel) {
          // If no game found via user ID, use the one from channel ID
          game = gameFromChannel;
        }
      }
    }

    // --- Initial Game Check ---
    if (!game) {
      // Avoid replying if the interaction is part of an already finished process (e.g., clicking old buttons)
      if (!interaction.deferred && !interaction.replied) {
        try {
          await interaction.reply({ content: 'Could not find an active game associated with this action or you are not part of it.' });
        } catch (error) {
          console.warn(`Interaction ${interaction.id}: Failed to send 'no game found' reply, likely interaction expired.`);
        }
      }
      return;
    }

    // --- Button Interactions ---
    if (interaction.isButton()) {
      const customIdParts = interaction.customId.split('_');

      // --- Player "Save" / "Send to GM" Button ---
      if (interaction.customId.startsWith('donestep7')) {
        const targetPlayerId = customIdParts[1];
        const textChannelIdFromButton = customIdParts[2];

        // Permission Check: Ensure the interactor is the correct player
        if (interactorId !== targetPlayerId) {
          await interaction.reply({ content: 'You cannot perform this action for another player.' });
          return;
        }
        // Context Check: Ensure the game context matches the button
        if (!game || game.textChannelId !== textChannelIdFromButton) {
          await interaction.reply({ content: 'Game context mismatch. Cannot perform this action.' });
          return;
        }

        // Handle the logic (sending to GM, saving state)
        await handleDoneButton(interaction, game); // handleDoneButton now only replies/sends DMs

        // Delete the player's inventory message AFTER handleDoneButton completes
        try {
          // Check if the message still exists before attempting deletion
          if (interaction.message) {
            await interaction.message.delete();
            console.log(`Deleted inventory message ${interaction.message.id} for player ${targetPlayerId}`);
          }
        } catch (error) {
          // Ignore error if message was already deleted (10008)
          if (error.code !== 10008) {
            console.error(`Error deleting inventory message ${interaction.message.id}:`, error);
          }
        }
        return; // Stop further processing for this interaction

        // --- Player "+ Add Gear" Button ---
      } else if (interaction.customId.startsWith('addgear')) {
        const textChannelIdFromButton = customIdParts[customIdParts.length - 1]; // Usually last part

        // Permission/Context Check (Optional but good practice)
        if (!game || game.textChannelId !== textChannelIdFromButton || !game.players[interactorId]) {
          await interaction.reply({ content: 'Cannot perform this action due to game context mismatch or you are not in this game.' });
          return;
        }
        // This button just opens a modal, no message deletion or disabling needed here
        await handleAddGearModal(interaction); // Pass game if needed by modal handler

        // --- Player "Edit Gear" Button (Opens Modal) ---
      } else if (interaction.customId.startsWith('edit_') && interaction.customId.includes('_gear_')) {
        const targetPlayerId = customIdParts[1];
        const textChannelIdFromButton = customIdParts[customIdParts.length - 1]; // Usually last part

        // Permission/Context Check
        if (interactorId !== targetPlayerId) {
          await interaction.reply({ content: 'You cannot edit gear for another player.' });
          return;
        }
        if (!game || game.textChannelId !== textChannelIdFromButton) {
          await interaction.reply({ content: 'Game context mismatch. Cannot perform this action.' });
          return;
        }

        const itemId = customIdParts[3];
        await handleEditGearModal(interaction, game, targetPlayerId, itemId);

        // --- Player "Delete Gear" Button (Opens Modal) ---
      } else if (interaction.customId.startsWith('delete_') && interaction.customId.includes('_gear_')) {
        const targetPlayerId = customIdParts[1];
        const textChannelIdFromButton = customIdParts[customIdParts.length - 1]; // Usually last part

        // Permission/Context Check
        if (interactorId !== targetPlayerId) {
          await interaction.reply({ content: 'You cannot delete gear for another player.' });
          return;
        }
        if (!game || game.textChannelId !== textChannelIdFromButton) {
          await interaction.reply({ content: 'Game context mismatch. Cannot perform this action.' });
          return;
        }

        const itemId = customIdParts[3];
        await handleDeleteGearModal(interaction, game, targetPlayerId, itemId);

        // --- GM "Approve" Inventory Button ---
      } else if (interaction.customId.startsWith('approve_')) {
        const targetPlayerId = customIdParts[1];
        const textChannelId = customIdParts[2];

        // Permission Check: Ensure the interactor is the GM
        if (interactorId !== game.gmId) {
          await interaction.reply({ content: 'Only the GM can approve inventories.' });
          return;
        }
        // Context Check: Ensure the game context matches the button
        if (!game || game.textChannelId !== textChannelId) {
          await interaction.reply({ content: 'Game context mismatch. Cannot perform this action.' });
          return;
        }

        const targetPlayer = game.players[targetPlayerId];
        if (!targetPlayer) {
          await interaction.reply({ content: `Error: Could not find player ${targetPlayerId} in game data.` });
          return;
        }

        const gearList = targetPlayer.gear && targetPlayer.gear.length > 0 ? targetPlayer.gear.join(', ') : 'No gear added.';
        const characterName = targetPlayer.name || targetPlayer.playerUsername;

        // Reply to the GM first
        await interaction.reply({ content: `You have approved (<@${targetPlayerId}>) **${characterName}'s starting inventory**: ${gearList}.` });

        // Disable buttons on the original GM message
        try {
          const originalMessage = interaction.message;
          if (originalMessage && originalMessage.components.length > 0) {
            const disabledRows = originalMessage.components.map(row => {
              const newRow = ActionRowBuilder.from(row);
              newRow.components.forEach(component => {
                if (component.data.type === ComponentType.Button) {
                  component.setDisabled(true);
                }
              });
              return newRow;
            });
            await originalMessage.edit({ components: disabledRows });
          }
        } catch (error) {
          if (error.code !== 10008) { // Ignore "Unknown Message"
            console.error(`Error disabling buttons on GM message ${interaction.message?.id}:`, error);
          }
        }

        // Update game state
        game.players[targetPlayerId].inventoryConfirmed = true;
        saveGameData();

        // Check if all players are done AFTER approving
        const allPlayersDone = game.playerOrder.every(pId => game.players[pId]?.inventoryConfirmed);
        if (allPlayersDone && game.characterGenStep === 7) { // Ensure we are still in step 7
          const gameChannel = client.channels.cache.get(game.textChannelId);
          if (gameChannel) {
            await gameChannel.send('All player inventories have been approved by the GM. Proceeding to the next step.');
            clearReminderTimers(game); // Make sure to import this
            game.characterGenStep++;
            saveGameData();
            sendCharacterGenStep(gameChannel, game);
          } else {
            console.error(`Could not find game channel ${game.textChannelId} to advance step.`);
            const gmUser = await client.users.fetch(game.gmId).catch(console.error);
            if (gmUser) {
              await gmUser.send(`Error: All inventories approved, but the game channel <#${game.textChannelId}> is invalid.`).catch(console.error);
            }
          }
        }

        // --- GM "Reject" Inventory Button ---
      } else if (interaction.customId.startsWith('tryagain_')) {
        const targetPlayerId = customIdParts[1];
        const textChannelId = customIdParts[2];

        // Permission Check: Ensure the interactor is the GM
        if (interactorId !== game.gmId) {
          await interaction.reply({ content: 'Only the GM can reject inventories.' });
          return;
        }
        // Context Check: Ensure the game context matches the button
        if (!game || game.textChannelId !== textChannelId) {
          await interaction.reply({ content: 'Game context mismatch. Cannot perform this action.' });
          return;
        }

        const targetPlayerUser = await client.users.fetch(targetPlayerId).catch(console.error);
        if (!targetPlayerUser) {
          await interaction.reply({ content: `Error: Could not fetch user data for player ${targetPlayerId}.` });
          return;
        }
        if (!game.players[targetPlayerId]) {
          await interaction.reply({ content: `Error: Could not find player ${targetPlayerId} in game data.` });
          return;
        }

        const characterName = game.players[targetPlayerId].name || game.players[targetPlayerId].playerUsername;

        // Reply to the GM first
        await interaction.reply({ content: `You have sent (<@${targetPlayerId}>) **${characterName}'s starting inventory** back to them for editing.` });

        // Disable buttons on the original GM message
        try {
          const originalMessage = interaction.message;
          if (originalMessage && originalMessage.components.length > 0) {
            const disabledRows = originalMessage.components.map(row => {
              const newRow = ActionRowBuilder.from(row);
              newRow.components.forEach(component => {
                if (component.data.type === ComponentType.Button) {
                  component.setDisabled(true);
                }
              });
              return newRow;
            });
            await originalMessage.edit({ components: disabledRows });
          }
        } catch (error) {
          if (error.code !== 10008) { // Ignore "Unknown Message"
            console.error(`Error disabling buttons on GM message ${interaction.message?.id}:`, error);
          }
        }

        // Update game state
        game.players[targetPlayerId].inventoryConfirmed = false; // Mark as not confirmed
        saveGameData();

        // Send the updated inventory display back to the player
        await displayInventory(targetPlayerUser, game, targetPlayerId, true); // Pass true for isRejected
      }
      // --- Other buttons can be handled here ---
    }
    // --- Modal Submissions ---
    else if (interaction.isModalSubmit()) {
      // Ensure game context is still valid for modal submitter
      if (!game || (!game.players[interactorId] && game.gmId !== interactorId)) {
        await interaction.reply({ content: 'Cannot process modal submission due to missing game context or permissions.' });
        return;
      }

      if (interaction.customId === 'addgearmodal') {
        await handleAddGearModalSubmit(interaction, game);
      } else if (interaction.customId.startsWith('deletegearconfirm_')) {
        const itemId = interaction.customId.split('_')[1];
        await handleDeleteGearModalSubmit(interaction, game, interactorId, itemId);
      } else if (interaction.customId.startsWith('editgear_')) {
        const itemId = interaction.customId.split('_')[1];
        await handleEditGearModalSubmit(interaction, game, interactorId, itemId);
      }
      // --- Other modal submissions ---
    }
    // --- Select Menu Interactions ---
    else if (interaction.isStringSelectMenu()) {
      if (interaction.customId.startsWith('gearselect_')) {
        const playerIdFromCustomId = interaction.customId.split('_')[1];

        // Permission Check
        if (interactorId !== playerIdFromCustomId) {
          await interaction.reply({ content: 'You cannot interact with another player\'s inventory.' });
          return;
        }
        // Context Check
        if (!game || !game.players[playerIdFromCustomId]) {
          await interaction.reply({ content: 'Cannot perform this action due to missing game context.' });
          return;
        }

        const itemId = interaction.values[0]; // This is the index
        const gear = game.players[playerIdFromCustomId].gear;
        const index = parseInt(itemId);

        // Ensure index is valid
        if (isNaN(index) || index < 0 || index >= gear.length) {
          await interaction.reply({ content: 'Invalid item selected.' });
          return;
        }
        const item = gear[index];

        // Generate Edit/Delete buttons
        const actionRow = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              // Include player ID, 'gear', item ID (index), and channel ID
              .setCustomId(`edit_${playerIdFromCustomId}_gear_${itemId}_${game.textChannelId}`)
              .setLabel('Edit')
              .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
              // Include player ID, 'gear', item ID (index), and channel ID
              .setCustomId(`delete_${playerIdFromCustomId}_gear_${itemId}_${game.textChannelId}`)
              .setLabel('Delete')
              .setStyle(ButtonStyle.Danger),
          );

        // Reply with the Edit/Delete options (NOT ephemeral)
        await interaction.reply({
          content: `What would you like to do with **${item}**?`,
          components: [actionRow]
        });
      }
    }
  }
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  const userId = message.author.id;
  const userName = message.author.username;

  if (message.channel.type === ChannelType.DM) {
    if (message.content.startsWith(BOT_PREFIX)) {
      const args = message.content.slice(BOT_PREFIX.length).split(/ +/);
      const command = args.shift().toLowerCase();

      console.log('DM Command:', message.content, 'from', userName);

      if (isTesting && command === 'testchargenstep') {
        await testCharGenStep(message, args);
      } else if (isTesting && command === 'testtts') {
        await testTTS(message, args);
      } else if (isTesting && command === 'testdice') {
        await testDiceSounds(message, args);
      } else if (isTesting && command === 'testfinalrec') {
        await testRecordingCommand(message, args);
      } else if (isTesting && command === 'testhts') {
        await testHandleTraitStacking(message, args)
      } else if (command === 'me') {
        await me(message);
      } else if (command === 'gear') {
        const game = gameData[message.channel.id];
        if (game && game.scene > 0) { // only accessible once scenes have started
          await displayInventory(user, game, playerId, false);
        } else {
          await message.author.send('You are not currently in a game, or this command is not available yet.');
        }
      } else if (command === 'x') {
        const game = findGameByUserId(userId);
        if (game) {
          await message.author.send('You have anonymously signaled to wrap up the scene.');
        } else {
          await message.author.send('You are not currently in a game.');
        }
      }
    } else {
      await handleFinalRecording(message);
    }
    return;
  } else if (message.channel.type !== ChannelType.DM) {
    if (message.content.startsWith(BOT_PREFIX)) {
      const args = message.content.slice(BOT_PREFIX.length).split(/ +/);
      const command = args.shift().toLowerCase();

      console.log('Channel command:', message.content, 'from', userName, 'in ' + message.channel.name);

      if (command === 'whitelist') {
        try {
          await whitelistChannel(message, args);
        } catch (error) {
          console.error(`Error handling ${command} command:`, error);
          message.channel.send(`An error occurred while processing the ${command} command. Check the console for details.`);
        }
        return;
      }

      if (isBlockedUser(userId) && command === 'startgame') {
        await respondViaDM(message, `You are blocked from using the \`${BOT_PREFIX}startgame\` command.`, 'startgame');
        return;
      }

      if (command === 'startgame') {
        if (!isWhitelisted(message.channel.id)) {
          try {
            await message.author.send(`The channel <#${message.channel.id}> is not whitelisted for \`${BOT_PREFIX}startgame\` commands. Please ask an administrator to use \`.whitelist ${message.channel.id}\` to enable games in this channel.`);
            await message.delete();
          } catch (error) {
            console.error(`Error sending DM or deleting message:`, error);
          }
          return;
        }
      }

      const game = gameData[channelId];
      const gameRequiredCommands = ['conflict', 'nextstep', 'gamestatus', 'removeplayer', 'leavegame', 'cancelgame', 'died', 'me', 'x', 'theme'];
      if (gameRequiredCommands.includes(command)) {
        if (!game) {
          await respondViaDM(message, `There is no **Ten Candles** game in progress in <#${channelId}>.`, 'gameRequiredCommands');
          return;
        }
        if (!game.players[userId] && game.gmId !== userId) {
          await respondViaDM(message, `You are not a participant in the **Ten Candles** game in <#${channelId}>.`, 'gameRequiredCommands');
          return;
        }
      }

      if (command === 'help') {
        const isAdmin = message.member.permissions.has('Administrator');
        const helpEmbed = getHelpEmbed(isAdmin, message);
        await message.channel.send({ embeds: [helpEmbed.help] });
      } else if (command === 'startgame') {
        await startGame(message, gameData);
      } else if (command === 'conflict' || command === 'c') {
        await conflict(message, args, gameData);
      } else if (command === 'theme') {
        await setTheme(message, args);
      } else if (command === 'nextstep') {
        await nextStep(message);
      } else if (command === 'prevstep') {
        await prevStep(message);
      } else if (command === 'gamestatus') {
        await gameStatus(message);
      } else if (command === 'removeplayer') {
        await removePlayer(message, args);
      } else if (command === 'leavegame') {
        await leaveGame(message, args);
      } else if (command === 'cancelgame') {
        await cancelGame(message);
      } else if (command === 'died') {
        await died(message, args);
      } else if (command === 'blockuser') {
        await blockUser(message, args);
      } else if (command === 'unblockuser') {
        await unblockUser(message, args);
      }
    }
  }
});

async function me(message) {
  const playerId = message.author.id;
  const game = findGameByUserId(playerId);
  const channelId = message.channel.id;

  if (message.channel.type !== ChannelType.DM) {
    try {
      await message.delete();
      await message.author.send({ content: 'The `.me` command can only be used in a direct message.' });
    } catch (error) {
      console.error('Could not send DM to user:', error);
    }
    return;
  }

  if (!game) {
    await message.author.send(`You are not currently in a game in any channel.`);
    return;
  }
  const player = game.players[playerId];
  const gameChannelId = Object.keys(gameData).find(key => gameData[key] === game);

  const characterEmbed = new EmbedBuilder()
    .setColor(0x0099FF)
    .setTitle(`Character Sheet: ${player ? player.name || message.author.username : message.author.username}`)
    .addFields(
      { name: 'Virtue', value: player ? player.virtue || 'Not set' : 'Not set', inline: true },
      { name: 'Vice', value: player ? player.vice || 'Not set' : 'Not set', inline: true },
      { name: 'Moment', value: player ? player.moment || 'Not set' : 'Not set' },
      { name: 'Brink', value: player ? player.brink || 'Not set' : 'Not set' },
      { name: 'Hope Dice', value: player ? player.hopeDice.toString() || '0' : '0' },
      { name: 'Final Recording', value: player ? player.recordings || 'Not set' : 'Not set' },
      { name: 'Stack Order', value: player ? player.stackOrder || 'Not set' : 'Not set' },
      { name: 'Virtue Burned', value: player ? player.virtueBurned ? 'Yes' : 'No' : 'No', inline: true },
      { name: 'Vice Burned', value: player ? player.viceBurned ? 'Yes' : 'No' : 'No', inline: true },
      { name: 'Moment Burned', value: player ? player.momentBurned ? 'Yes' : 'No' : 'No' },
      { name: 'Inventory', value: player ? player.gear.length > 0 ? player.gear.join(', ') : 'No gear added.' : 'No gear added.' },
      { name: 'Dead', value: player ? player.isDead ? 'Yes' : 'No' : 'No' },
      { name: 'Brink you wrote', value: player ? player.givenBrink || 'Not set' : 'Not set' },
      { name: 'Session Theme', value: game ? game.theme || 'Not set' : 'Not set' },
      { name: 'Active Game Channel:', value: `<#${gameChannelId}>` },
    )
    .setTimestamp();

  try {
    await message.author.send({ embeds: [characterEmbed] });
  } catch (error) {
    console.error('Could not send character sheet DM: ', error.message);
  }
}

export async function startTruthsSystem(client, message, channelId) {
  const game = gameData[channelId];
  const playerOrder = game.playerOrder;
  const gmId = game.gmId;
  const litCandles = 11 - game.scene;

  let truthSpeakerIndex = 0;
  if (game.diceLost > 0) {
    truthSpeakerIndex = playerOrder.indexOf(message.author.id);
  } else {
    truthSpeakerIndex = playerOrder.indexOf(gmId);
  }

  let truthOrderMessage = "";
  for (let i = 0; i < litCandles; i++) {
    const speakerId = playerOrder[truthSpeakerIndex];
    const player = game.players[speakerId];
    if (player) {
      truthOrderMessage += `Truth ${i + 1}>: <@${speakerId}>${player.isDead ? " (Ghost)" : ""}\n`;
    }
    truthSpeakerIndex = (truthSpeakerIndex + 1) % playerOrder.length;
  }

  const livingPlayers = playerOrder.filter(playerId => game.players[playerId] && !game.players[playerId].isDead);
  let finalTruthMessage = "";
  if (livingPlayers.length > 0) {
    finalTruthMessage = "*(Living characters only)* All together: **And we are alive.**";
  }

  let fullMessage = `GM only: **These things are true. The world is dark.**\n\n`;

  if (truthOrderMessage) {
    fullMessage += `Establishing Truths order:\n${truthOrderMessage}\n\n`;
  }

  fullMessage += `${finalTruthMessage}`;

  message.channel.send(fullMessage);

  game.diceLost = 0;

  saveGameData();
}

export async function whitelistChannel(message, args) {
  if (!message.member.permissions.has('Administrator') && !message.member.permissions.has('KickMembers')) {
    try {
      await message.author.send('Only administrators or users with the `Kick Members` permission can use this command.');
      await message.delete();
    } catch (error) {
      console.error(`whitelistChannel: Failed to delete message: ${error.message}`);
    }
    return;
  }

  const channelToWhitelistId = parseChannelId(args[0]);
  if (!channelToWhitelistId) {
    try {
      await message.author.send('Invalid channel ID or mention.');
      await message.delete();
    } catch (error) {
      console.error(`whitelistChannel: Failed to delete message: ${error.message}`);
    }
    return;
  }

  let channel = client.channels.cache.get(channelToWhitelistId);
  if (!channel) {
    try {
      channel = await client.channels.fetch(channelToWhitelistId);
    } catch (error) {
      console.error(`whitelistChannel: Error fetching channel ${channelToWhitelistId}:`, error);
      try {
        await message.author.send(`Could not find channel with ID ${channelToWhitelistId}.`);
        await message.delete();
      } catch (error) {
        console.error(`whitelistChannel: Failed to delete message: ${error.message}`);
      }
      return;
    }
  }

  const channelName = channel ? channel.name : 'Unknown Channel';
  const guildName = channel ? channel.guild.name : 'Unknown Server';
  const adminName = message.member.id;
  const botName = client.user.id;
  const channelType = channel.type === ChannelType.GuildVoice ? 'voice' : 'text';

  let dmText;
  let channelText;
  if (args[1] && args[1].toLowerCase() === 'remove') {
    if (channelWhitelist[channelToWhitelistId]) {
      delete channelWhitelist[channelToWhitelistId];
      dmText = `**<#${channelToWhitelistId}>** has been removed from the channel whitelist.`;
      channelText = `This ${channelType} channel has been removed from the whitelist for <@${botName}> by <@${adminName}>.`;
    } else {
      dmText = `**<#${channelToWhitelistId}>** was not on the channel whitelist.`;
    }
  } else {
    if (!channelWhitelist[channelToWhitelistId]) {
      channelWhitelist[channelToWhitelistId] = true;
      dmText = `**<#${channelToWhitelistId}>** has been added to the channel whitelist.`;
      channelText = `This ${channelType} channel has been whitelisted for <@${botName}> by <@${adminName}>. Use the \`.startgame\` command to begin a session.`;
    } else {
      dmText = `**<#${channelToWhitelistId}>** is already on the channel whitelist.`;
    }
  }

  try {
    await message.author.send(dmText);
  } catch (error) {
    console.error('whitelistChannel: Failed to send DM:', error);
  }
  try {
    await message.delete();
  } catch (error) {
    console.error(`whitelistChannel: Failed to delete message: ${error.message}`);
  }
  if (channelWhitelist[channelToWhitelistId] || (args[1] && args[1].toLowerCase() === 'remove')) {
    saveChannelWhitelist();
  }
  if (channelText) {
    try {
      await channel.send(channelText);
    } catch (error) {
      console.error(`whitelistChannel: Failed to send message to channel ${channelToWhitelistId}:`, error);
    }
  }
  return;
}

export function parseChannelId(input) {
  if (!input) return null;

  const channelIdMatch = input.match(/<#(\d+)>/);

  if (channelIdMatch) {
    return channelIdMatch[1];
  }

  if (/^\d+$/.test(input)) {
    return input;
  }

  const channelName = input.startsWith('#') ? input.slice(1) : input;
  const channel = client.channels.cache.find(c => c.name === channelName);
  if (channel) {
    return channel.id;
  }
  return null;
}

export async function setTheme(message, args) {
  const channelId = message.channel.id;
  const game = gameData[channelId];

  if (!game) {
    message.channel.send('No game in progress.');
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

  const themeDescription = args.join(' ').trim();

  if (themeDescription) { game.theme = themeDescription; }

  if (game.characterGenStep === 2) {
    game.characterGenStep++;
    saveGameData();
    const gameChannel = message.guild.channels.cache.get(game.textChannelId);
    sendCharacterGenStep(gameChannel, game);
  }
}

async function handleFinalRecording(message) {
  const userId = message.author.id;
  const game = findGameByUserId(userId);

  if (!game) return;
  if (game.characterGenStep !== 8) return;
  if (!game.players[userId]) return;

  const player = game.players[userId];

  if (message.attachments.size > 0) {
    const attachment = message.attachments.first();
    if (attachment.contentType.startsWith('audio/')) {
      player.recording = attachment.url;
    }
  } else {
    player.recording = message.content;
  }

  const isFinal = await requestConsent(message.author, 'Are you happy with this recording?', 'final_recording_yes', 'final_recording_no', 60000, 'Final Recording Confirmation');

  if (isFinal) {
    await message.author.send('Your final recording has been received.');
    const allPlayersHaveRecordings = Object.values(game.players).every(player => player.recording);
    if (allPlayersHaveRecordings) {
      await playRecordings(message);
    }
  } else {
    await message.author.send('Your recording has been saved, but you can send another one if you wish.');
  }
}

export async function playRecordings(message) {
  const channelId = message.channel.id;
  const game = gameData[channelId];
  const players = game.players;

  message.channel.send(finalRecordingsMessage);

  // Total of 13 second 'moment of silence'
  await new Promise(resolve => setTimeout(resolve, 10000));
  let delay = 3000;

  const playerIds = Object.keys(players);

  async function playNextRecording(index) {
    if (index >= playerIds.length) {
      await cancelGame(message);
      return;
    }

    const userId = playerIds[index];

    setTimeout(async () => {
      if (players[userId].recording) {
        if (game.gameMode === 'voice-plus-text') {
          const voiceChannelId = game.voiceChannelId;
          const voiceChannel = client.channels.cache.get(voiceChannelId);

          // Voice Channel Connection Check
          const existingConnection = getVoiceConnection(message.guild.id);
          if (!existingConnection) {
            if (voiceChannel && voiceChannel.type === ChannelType.GuildVoice) {
              try {
                joinVoiceChannel({
                  channelId: voiceChannelId,
                  guildId: message.guild.id,
                  adapterCreator: message.guild.voiceAdapterCreator,
                });
                console.log(`Joined voice channel: ${voiceChannel.name}`);
              } catch (error) {
                console.error('Failed to join voice channel:', error);
                message.channel.send('Failed to join voice channel. Playing back in text only.');
                game.gameMode = "text-only";
              }
            } else {
              console.error(`Voice channel ${voiceChannelId} not found.`);
              message.channel.send('Voice channel not found. Playing back in text only.');
              game.gameMode = "text-only";
            }
          }

          if (players[userId].recording.startsWith('http')) {
            try {
              message.channel.send(`Playing *${players[userId].name}'s final message...*`);
              await playAudioFromUrl(players[userId].recording, voiceChannel);
            } catch (error) {
              console.error(`Error playing audio recording for ${userId}:`, error);
              message.channel.send(`Error playing recording for <@${userId}>. Check console for details.`);
            }
          } else {
            if (players[userId].language && players[userId].voice) {
              const verbiage = players[userId].recording;
              await message.channel.send(`Playing *${players[userId].name}'s final message...*`);
              await speakInChannel(verbiage, voiceChannel, players[userId].voice);
            } else {
              message.channel.send(`Playing *${players[userId].name}'s final message...*`);
              message.channel.send(players[userId].recording);
            }
          }
        } else {
          if (players[userId].recording.startsWith('http')) {
            const duration = await getAudioDuration(players[userId].recording);
            message.channel.send(`Click the link to listen to ${players[userId].name}'s final message: ${players[userId].recording}`);
            if (duration) {
              await new Promise(resolve => setTimeout(resolve, duration));
            }
          } else {
            message.channel.send(`Playing *${players[userId].name}'s final message...*`);
            message.channel.send(players[userId].recording);
          }
        }
      } else {
        message.channel.send(`No playable recording found for <@${userId}> / ${players[userId].name}.`);
      }

      await playNextRecording(index + 1);
    }, delay);
  }

  await playNextRecording(0);
  saveGameData();
}

async function sendTestDM(client, message) {
  if (isTesting) {
    try {
      const testUser = await client.users.fetch(TEST_USER_ID);
      await testUser.send(message);
      console.log(`Sent test DM to ${testUser.tag}`);
    } catch (error) {
      console.error(`Error sending test DM:`, error);
    }
  }
}

export async function testRecordingCommand(message, args) {
  const targetChannelId = args[0];
  const targetChannel = client.channels.cache.get(targetChannelId);

  if (!targetChannel) {
    await message.channel.send(`Could not find channel with ID: ${targetChannelId}`);
    return;
  }

  if (targetChannel.type !== ChannelType.GuildText && targetChannel.type !== ChannelType.GuildVoice) {
    await message.channel.send(`Channel ${targetChannel.name} is not a valid text or voice channel.`);
    return;
  }

  if (targetChannel.type === ChannelType.GuildVoice) {
    const existingConnection = getVoiceConnection(targetChannel.guild.id);
    if (!existingConnection) {
      joinVoiceChannel({
        channelId: targetChannelId,
        guildId: targetChannel.guild.id,
        adapterCreator: targetChannel.guild.voiceAdapterCreator,
      });
      console.log(`Joined voice channel: ${targetChannel.name}`);
    }
  }
}

async function testDiceSounds(message, args) {
  try {
    const voiceChannelId = args[0];

    let voiceChannel = client.channels.cache.get(voiceChannelId);

    if (!voiceChannel) {
      try {
        voiceChannel = await client.channels.fetch(voiceChannelId);
      } catch (error) {
        await message.channel.send(`Voice channel with ID ${voiceChannelId} not found.`);
        return;
      }
    }

    if (!voiceChannel) {
      await message.channel.send(`Voice channel with ID ${voiceChannelId} not found.`);
      return;
    }

    const guildId = voiceChannel.guildId;

    if (!guildId) {
      await message.channel.send(`Could not determine guild ID from channel ID ${voiceChannelId}.`);
      return;
    }

    const guild = client.guilds.cache.get(guildId);

    if (!guild) {
      await message.channel.send(`Guild with ID ${guildId} not found.`);
      return;
    }

    if (voiceChannel.type !== ChannelType.GuildVoice) {
      await message.channel.send(`Channel ${voiceChannelId} is not a voice channel.`);
      return;
    }

    const existingConnection = getVoiceConnection(guildId);
    if (!existingConnection) {
      joinVoiceChannel({
        channelId: voiceChannelId,
        guildId: guildId,
        adapterCreator: guild.voiceAdapterCreator,
      });
    }

    await playRandomConflictSound(voiceChannel);
    await message.channel.send('Sending the playRandomConflictSound() call.');
  } catch (error) {
    await message.channel.send('An error occurred while testing dice sounds.');
  }
}

async function testHandleTraitStacking(message, args) {
  if (args.length < 4) {
    await message.channel.send(`Usage: ${BOT_PREFIX}testhts <Game Channel ID> <GM ID> <Player1 ID> <Player2 ID> [<Player3 ID> ...]\``);
    return;
  }

  const gameChannelId = args.shift();
  const gmId = args.shift();
  const playerIds = args;
  const channelId = message.channel.id;

  // Validate IDs
  if (!/^\d+$/.test(gmId)) {
    await message.channel.send(`Invalid GM ID: ${gmId}. Please use a numeric user ID.`);
    return;
  }
  if (!/^\d+$/.test(gameChannelId)) {
    await message.channel.send(`Invalid Game Channel ID: ${gameChannelId}. Please use a numeric channel ID.`);
    return;
  }
  for (const playerId of playerIds) {
    if (!/^\d+$/.test(playerId)) {
      await message.channel.send(`Invalid Player ID: ${playerId}. Please use a numeric user ID.`);
      return;
    }
  }

  // Fetch the game channel
  let gameChannel;
  try {
    gameChannel = await client.channels.fetch(gameChannelId);
  } catch (error) {
    console.error(`testHandleTraitStacking: Error fetching game channel ${gameChannelId}:`, error);
    await message.channel.send(`Could not find game channel with ID ${gameChannelId}.`);
    return;
  }

  if (!gameChannel) {
    await message.channel.send(`Could not find game channel with ID ${gameChannelId}.`);
    return;
  }

  // Fetch the guild
  const guild = gameChannel.guild;
  if (!guild) {
    await message.channel.send(`Could not find guild for channel ${gameChannelId}.`);
    return;
  }

  // Send a message to the game channel and store the message object
  const testMessage = await gameChannel.send({ content: `A test of HandleTraitStacking() is being run by <@${message.author.id}> with GM <@${gmId}> and players ${playerIds.map(id => `<@${id}>`).join(', ')}.` });

  // Create a dummy game object
  const game = {
    gm: { consent: true, brink: '' },
    players: {},
    playerOrder: [], // Initialize as empty
    characterGenStep: 6, // Set to step 6 for trait stacking
    traitsRequested: true,
    theme: 'Test Theme',
    textChannelId: gameChannelId, // Use the provided gameChannelId
    guildId: guild.id,
    voiceChannelId: gameChannelId, // Use the provided gameChannelId
    gameMode: 'text-only',
    initiatorId: message.author.id,
    gmId: gmId,
    diceLost: 0,
  };

  const fetchedPlayers = []; // Array to store fetched player objects

  for (const playerId of playerIds) {
    try {
      const member = await guild.members.fetch(playerId);
      const player = member;
      if (player) {
        game.players[playerId] = {
          playerUsername: player.user.username,
          consent: true,
          brink: 'Test Brink',
          moment: 'Test Moment',
          virtue: 'Test Virtue',
          vice: 'Test Vice',
          name: 'Test Name',
          look: 'Test Look',
          concept: 'Test Concept',
          recordings: '',
          hopeDice: 0,
          virtueBurned: false,
          viceBurned: false,
          momentBurned: false,
          isDead: false,
          availableTraits: ['Virtue', 'Vice', 'Moment'], // Initialize availableTraits here
          stackOrder: [], // Initialize stackOrder here
          initialChoice: null, // Initialize initialChoice here
          inventoryConfirmed: false, // Initialize inventoryConfirmed here
          gear: [], // Initialize gear here
        };
        fetchedPlayers.push(player); // Add fetched player to the array
        game.playerOrder.push(playerId); // Add playerId to playerOrder
      } else {
        console.error(`testHandleTraitStacking: Could not fetch member with ID ${playerId}`);
        await message.channel.send(`Could not fetch member with ID ${playerId}. Skipping this player.`);
      }
    } catch (error) {
      console.error(`testHandleTraitStacking: Error fetching member with ID ${playerId}:`, error);
      await message.channel.send(`Error fetching member with ID ${playerId}. Skipping this player.`);
    }
  }

  gameData[gameChannelId] = game; // Use the provided gameChannelId
  saveGameData();

  await handleTraitStacking(game); // Removed initialMessages
  console.log(`testHandleTraitStacking: handleTraitStacking complete`);
  await message.channel.send('Test for handleTraitStacking() complete.');

  try {
    await testMessage.delete();
  } catch (error) {
    console.error(`testHandleTraitStacking: Error deleting test message:`, error);
  }
}

async function testCharGenStep(message, args) {
  if (args.length < 4) {
    await message.channel.send(`Usage: ${BOT_PREFIX}testchargenstep <Step Number> <Game Channel ID> <GM ID> <Player1 ID> [<Player2 ID> ...]\``);
    return;
  }

  const step = parseInt(args.shift());
  const gameChannelId = args.shift();
  const gmId = args.shift();
  const playerIds = args;
  const channelId = message.channel.id;

  if (step < 1 || step > 9) { // Ensure step is between 1 and 9
    await message.channel.send(`Invalid Step Number: ${step}. Please use a number between 1 and 9.`);
    return;
  }

  // Validate IDs
  if (!/^\d+$/.test(gmId)) {
    await message.channel.send(`Invalid GM ID: ${gmId}. Please use a numeric user ID.`);
    return;
  }
  if (!/^\d+$/.test(gameChannelId)) {
    await message.channel.send(`Invalid Game Channel ID: ${gameChannelId}. Please use a numeric channel ID.`);
    return;
  }
  for (const playerId of playerIds) {
    if (!/^\d+$/.test(playerId)) {
      await message.channel.send(`Invalid Player ID: ${playerId}. Please use a numeric user ID.`);
      return;
    }
  }

  // Validate player count
  if (playerIds.length < 1 || playerIds.length > 9) {
    await message.channel.send('Invalid number of players. Please provide between 1 and 9 player IDs.');
    return;
  }

  // Fetch the game channel
  let gameChannel;
  try {
    gameChannel = await client.channels.fetch(gameChannelId);
  } catch (error) {
    console.error(`testHandleTraitStacking: Error fetching game channel ${gameChannelId}:`, error);
    await message.channel.send(`Could not find game channel with ID ${gameChannelId}.`);
    return;
  }

  if (!gameChannel) {
    await message.channel.send(`Could not find game channel with ID ${gameChannelId}.`);
    return;
  }

  // Fetch the guild
  const guild = gameChannel.guild;
  if (!guild) {
    await message.channel.send(`Could not find guild for channel ${gameChannelId}.`);
    return;
  }

  // Send a message to the game channel and store the message object
  const testMessage = await gameChannel.send({ content: `A test of Character Generation Step ${step} is being run by <@${message.author.id}> with GM <@${gmId}> and players ${playerIds.map(id => `<@${id}>`).join(', ')}.` });

  // Determine gameMode based on channel type
  const gameMode = gameChannel.type === ChannelType.GuildVoice ? 'voice-plus-text' : 'text-only';

  // Create a dummy game object
  const game = {
    gm: { consent: true, brink: getRandomBrink(true) }, // Use a random threat brink for the GM in the test
    players: {},
    playerOrder: [], // Initialize as empty
    characterGenStep: step, // Set to the specified step
    traitsRequested: true,
    theme: 'Test Theme',
    textChannelId: gameChannelId, // Use the provided gameChannelId
    guildId: guild.id,
    voiceChannelId: gameChannelId, // Use the provided gameChannelId
    gameMode: gameMode, // Set based on channel type
    initiatorId: message.author.id,
    gmId: gmId,
    diceLost: 0,
  };

  // Fetch GM data
  const gmMember = await guild.members.fetch(gmId);
  if (!gmMember) {
    console.error(`testCharGenStep: Could not fetch GM member with ID ${gmId}`);
    await message.channel.send(`Could not fetch GM member with ID ${gmId}.`);
    return;
  }

  // Add GM to players object
  game.players[gmId] = {
    playerUsername: gmMember.user.username,
    consent: true,
    brink: getRandomBrink(true),
    moment: getRandomMoment(),
    virtue: getRandomVirtue(),
    vice: getRandomVice(),
    name: getRandomName(),
    look: getRandomLook(),
    concept: getRandomConcept(),
    recordings: '',
    hopeDice: 0,
    virtueBurned: false,
    viceBurned: false,
    momentBurned: false,
    isDead: false,
    availableTraits: ['Virtue', 'Vice', 'Moment'],
    stackOrder: [],
    initialChoice: null,
    inventoryConfirmed: false,
  };

  const fetchedPlayers = []; // Array to store fetched player objects

  for (const playerId of playerIds) {
    try {
      const member = await guild.members.fetch(playerId);
      const player = member;
      if (player) {
        game.players[playerId] = {
          playerUsername: player.user.username,
          consent: true,
          brink: getRandomBrink(),
          moment: getRandomMoment(),
          virtue: getRandomVirtue(),
          vice: getRandomVice(),
          name: getRandomName(),
          look: getRandomLook(),
          concept: getRandomConcept(),
          recordings: '',
          hopeDice: 0,
          virtueBurned: false,
          viceBurned: false,
          momentBurned: false,
          isDead: false,
          availableTraits: ['Virtue', 'Vice', 'Moment'],
          stackOrder: [],
          initialChoice: null,
          gear: step > 7 ? ['House Keys', 'Cell Phone', 'Hair Clip'] : [], // Add gear for after step 7 only
          inventoryConfirmed: false,
        };
        fetchedPlayers.push(player); // Add fetched player to the array
        game.playerOrder.push(playerId); // Add playerId to playerOrder
      } else {
        console.error(`testHandleTraitStacking: Could not fetch member with ID ${playerId}`);
        await message.channel.send(`Could not fetch member with ID ${playerId}. Skipping this player.`);
      }
    } catch (error) {
      console.error(`testHandleTraitStacking: Error fetching member with ID ${playerId}:`, error);
      await message.channel.send(`Error fetching member with ID ${playerId}. Skipping this player.`);
    }
  }

  // Clear data for steps after the test step
  clearDataForLaterSteps(game, step);

  gameData[gameChannelId] = game; // Use the provided gameChannelId
  saveGameData();

  await message.channel.send(`Starting character generation at step ${step} in <#${gameChannelId}> with GM <@${gmId}> and players ${playerIds.map(id => `<@${id}>`).join(', ')}.`);

  await sendCharacterGenStep(gameChannel, game);

  try {
    await testMessage.delete();
  } catch (error) {
    console.error(`testHandleTraitStacking: Error deleting test message:`, error);
  }
}

function clearDataForLaterSteps(game, step) {
  const propertiesToClear = {
    6: ['stackOrder', 'initialChoice', 'availableTraits'],
    7: ['gear', 'recording'],
    8: ['recording'],
  };

  for (let i = step + 1; i <= 8; i++) {
    clearPlayerProperties(game, propertiesToClear[i]);
  }
}

function clearPlayerProperties(game, properties) {
  if (!properties) return;
  for (const playerId in game.players) {
    properties.forEach(property => delete game.players[playerId][property]);
  }
}

client.login(process.env.DISCORD_TOKEN);