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
  loadGameData, saveGameData, printActiveGames, getGameData,
  gameData, playAudioFromUrl, playRandomConflictSound, handleEditGearModal,
  speakInChannel, requestConsent, loadBlockUserList, isWhitelisted, handleAddGearModal,
  handleAddGearModalSubmit, isBlockedUser, loadChannelWhitelist, saveChannelWhitelist,
  channelWhitelist, respondViaDM, findGameByUserId, handleTraitStacking, getRandomBrink,
  getRandomMoment, getRandomVice, getRandomVirtue, getRandomName, getRandomLook, getRandomConcept,
  handleDoneButton, handleDeleteGearModal, handleDeleteGearModalSubmit, handleEditGearModalSubmit,
  displayInventory, markPlayerDead, askPlayerToGiftHope, sendDM, clearReminderTimers
} from './utils.js';
import { prevStep, sendCharacterGenStep } from './steps.js';
import { startGame } from './commands/startgame.js';
import { conflict } from './commands/conflict.js';
import { generatePlayerStatusEmbed, generateGameStatusEmbed } from './commands/gamestatus.js';
import { removePlayer } from './commands/removeplayer.js';
import { leaveGame } from './commands/leavegame.js';
import { cancelGame } from './commands/cancelgame.js';
import { died } from './commands/died.js';
import { gameStatus } from './commands/gamestatus.js';
import { getVoiceConnection, joinVoiceChannel } from '@discordjs/voice';

export const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers, GatewayIntentBits.DirectMessages, GatewayIntentBits.GuildMessageReactions, GatewayIntentBits.GuildVoiceStates] });

const version = '0.9.955a';
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
        if (game.pendingMartyrdom) {
          console.log(`Clearing pending martyrdom state for game ${channelId} on restart.`);
          // Clear associated timeouts if IDs were stored (though they are likely invalid after restart)
          if (game.pendingMartyrdom.gmTimeoutId) clearTimeout(game.pendingMartyrdom.gmTimeoutId);
          if (game.pendingMartyrdom.playerTimeoutId) clearTimeout(game.pendingMartyrdom.playerTimeoutId);
          delete game.pendingMartyrdom;
          saveGameData(); // Save the cleared state
        }
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

  // --- Button, Modal, Select Menu Handling ---
  if (interaction.isButton() || interaction.isModalSubmit() || interaction.isStringSelectMenu()) {
    const interactorId = interaction.user.id;
    let game = null; // Initialize game to null
    let gameChannelId = null; // Initialize gameChannelId

    // --- Game Finding Logic ---
    // Try extracting channel ID from customId first (most reliable for interactions tied to a game)
    const customIdParts = interaction.customId.split('_');
    const potentialChannelId = customIdParts[customIdParts.length - 1]; // Often the last part

    if (/^\d+$/.test(potentialChannelId)) {
      gameChannelId = potentialChannelId;
      game = getGameData(gameChannelId);
    }

    // If no game found via channel ID in customId, try finding by user ID (for DM commands like .me, .gear)
    if (!game && (interaction.isButton() || interaction.isModalSubmit() || interaction.isStringSelectMenu())) {
      const userGame = findGameByUserId(interactorId);
      if (userGame) {
        game = userGame;
        gameChannelId = game.textChannelId; // Get channel ID from the found game
      }
    }

    // --- GM Status Button Handling ---
    if (interaction.isButton() && interaction.customId.startsWith('gmstatus_')) {
      // customId format: gmstatus_<type>_<targetId>_<channelId> OR gmstatus_game_<channelId>
      const parts = interaction.customId.split('_');
      const type = parts[1]; // 'game' or 'player'
      const channelIdFromButton = parts[parts.length - 1]; // Always last part

      const statusGame = getGameData(channelIdFromButton);

      if (!statusGame) {
        await interaction.reply({ content: 'Could not find the game associated with this button.', ephemeral: true });
        return;
      }

      // Permission Check: Must be the GM
      if (interaction.user.id !== statusGame.gmId) {
        await interaction.reply({ content: 'Only the GM can view this status information.', ephemeral: true });
        return;
      }

      let newEmbed;
      let targetId = null;
      if (type === 'player') {
        targetId = parts[2]; // Player ID is the third part
        newEmbed = generatePlayerStatusEmbed(statusGame, targetId);
      } else { // type === 'game'
        let gameChannelName = `Channel ${channelIdFromButton}`;
        try {
          const channel = await client.channels.fetch(channelIdFromButton);
          if (channel) gameChannelName = `#${channel.name}`;
        } catch { /* Ignore error, use fallback */ }
        newEmbed = generateGameStatusEmbed(statusGame, gameChannelName);
      }

      // Update button states (disable the clicked one, enable others)
      const updatedComponents = interaction.message.components.map(row => {
        const newRow = ActionRowBuilder.from(row);
        newRow.components.forEach(component => {
          if (component.data.type === ComponentType.Button) {
            // Disable the button if its customId matches the interaction's customId
            // Enable if it doesn't match
            component.setDisabled(component.data.custom_id === interaction.customId);
          }
        });
        return newRow;
      });

      try {
        await interaction.update({ embeds: [newEmbed], components: updatedComponents });
      } catch (error) {
        console.error(`Error updating GM status interaction: ${error}`);
        // Attempt a follow-up if update fails (e.g., interaction expired)
        try {
          await interaction.followUp({ content: 'Failed to update the status view.', ephemeral: true });
        } catch (followUpError) {
          console.error(`Error sending follow-up for failed GM status update: ${followUpError}`);
        }
      }
      return; // Handled GM status button, stop further processing
    }

    // Martyrdom Confirmation Button Handling (GM) ---
    if (interaction.isButton() && interaction.customId.startsWith('martyr_confirm_')) {
      // customId format: martyr_confirm_yes/no_<playerIdToKill>_<channelId>
      const parts = interaction.customId.split('_');
      const confirmationType = parts[2]; // 'yes' or 'no'
      const playerIdToKill = parts[3];
      const channelIdFromButton = parts[4];

      const martyrGame = getGameData(channelIdFromButton);

      if (!martyrGame) {
        await interaction.reply({ content: 'Could not find the game associated with this martyrdom confirmation.', ephemeral: true });
        return;
      }

      // Permission Check: Must be the GM
      if (interaction.user.id !== martyrGame.gmId) {
        await interaction.reply({ content: 'Only the GM can respond to this confirmation.', ephemeral: true });
        return;
      }

      // State Check: Ensure this confirmation is still pending and matches the interaction
      if (!martyrGame.pendingMartyrdom || martyrGame.pendingMartyrdom.dyingPlayerId !== playerIdToKill || martyrGame.pendingMartyrdom.gmMessageId !== interaction.message.id) {
        await interaction.reply({ content: 'This martyrdom confirmation is no longer valid or has already been processed.', ephemeral: true });
        // Disable buttons on the potentially old message
        try {
          const disabledRow = new ActionRowBuilder().addComponents(
            interaction.message.components[0].components.map(button => ButtonBuilder.from(button).setDisabled(true))
          );
          await interaction.update({ components: [disabledRow] });
        } catch (e) {
          if (e.code !== 10008 && e.code !== 10062) { // Ignore if message/interaction gone
            console.error("martyr_confirm: Error disabling old buttons:", e);
          }
        }
        return;
      }

      // Clear the GM timeout
      if (martyrGame.pendingMartyrdom.gmTimeoutId) {
        clearTimeout(martyrGame.pendingMartyrdom.gmTimeoutId);
        martyrGame.pendingMartyrdom.gmTimeoutId = null; // Clear the stored ID
      }

      // Retrieve the reason before potentially deleting the pending state
      const reason = martyrGame.pendingMartyrdom.reason;
      const dyingPlayer = martyrGame.players[playerIdToKill];
      const characterName = dyingPlayer?.name || dyingPlayer?.playerUsername || `<@${playerIdToKill}>`;

      // Disable buttons on the GM's DM
      try {
        const disabledRow = new ActionRowBuilder().addComponents(
          interaction.message.components[0].components.map(button => ButtonBuilder.from(button).setDisabled(true))
        );
        // Update the message content based on the choice
        const updateContent = confirmationType === 'yes'
          ? `You confirmed martyrdom for ${characterName}. They will be prompted.`
          : `You denied martyrdom for ${characterName}.`;
        await interaction.update({ content: updateContent, components: [disabledRow] });
      } catch (editError) {
        // Ignore if interaction already acknowledged or message deleted
        if (editError.code !== 10062 && editError.code !== 10008) {
          console.error("martyr_confirm: Error disabling buttons:", editError);
        }
      }

      const gameChannel = client.channels.cache.get(channelIdFromButton);
      if (!gameChannel) {
        console.error(`martyr_confirm: Could not find game channel ${channelIdFromButton}`);
        await interaction.followUp({ content: `Error: Could not find the game channel <#${channelIdFromButton}>.`, ephemeral: true });
        // Clean up pending state even on error
        delete martyrGame.pendingMartyrdom;
        saveGameData();
        return;
      }

      if (confirmationType === 'yes') {
        // GM confirmed martyrdom
        console.log(`martyr_confirm: GM ${interaction.user.id} confirmed martyrdom for player ${playerIdToKill} in game ${channelIdFromButton}. Reason: ${reason}`);

        try {
          const dyingPlayerUser = await client.users.fetch(playerIdToKill);
          // Pass the game object which now contains the pendingMartyrdom info (including reason)
          await askPlayerToGiftHope(dyingPlayerUser, martyrGame, playerIdToKill);
          // No need for followUp here as the interaction.update already confirmed
          // Save game data (includes updated pendingMartyrdom with playerTimeoutId if set by askPlayerToGiftHope)
          saveGameData();
        } catch (error) {
          console.error(`martyr_confirm: Error fetching dying player or calling askPlayerToGiftHope for ${playerIdToKill}:`, error);
          await interaction.followUp({ content: `An error occurred trying to prompt the player <@${playerIdToKill}>. Proceeding as normal death.`, ephemeral: true });
          // Fallback to normal death
          delete martyrGame.pendingMartyrdom; // Clean up
          markPlayerDead(martyrGame, playerIdToKill, reason, gameChannel); // markPlayerDead saves
        }

      } else { // confirmationType === 'no'
        // GM denied martyrdom
        console.log(`martyr_confirm: GM ${interaction.user.id} denied martyrdom for player ${playerIdToKill} in game ${channelIdFromButton}.`);
        // Clean up pending state *before* calling markPlayerDead
        delete martyrGame.pendingMartyrdom;
        saveGameData(); // Save the cleanup
        // No need for followUp here as the interaction.update already confirmed
        // Proceed with normal death
        markPlayerDead(martyrGame, playerIdToKill, reason, gameChannel); // markPlayerDead saves
      }

      return; // Handled martyrdom confirmation
    }

    // Hope Gifting Select Menu Handling (Player) ---
    if (interaction.isStringSelectMenu() && interaction.customId.startsWith('gift_hope_select_')) {
      // customId format: gift_hope_select_<dyingPlayerId>_<channelId>
      const parts = interaction.customId.split('_');
      const dyingPlayerId = parts[3];
      const channelIdFromMenu = parts[4];

      const hopeGame = getGameData(channelIdFromMenu);

      if (!hopeGame) {
        await interaction.reply({ content: 'Could not find the game associated with this action.', ephemeral: true });
        return;
      }

      // Permission Check: Must be the dying player
      if (interaction.user.id !== dyingPlayerId) {
        await interaction.reply({ content: 'Only the character who died can choose who receives their Hope Die.', ephemeral: true });
        return;
      }

      // State Check: Ensure martyrdom was confirmed and is still pending for this player
      if (!hopeGame.pendingMartyrdom || hopeGame.pendingMartyrdom.dyingPlayerId !== dyingPlayerId) {
        await interaction.reply({ content: 'This action is no longer valid or has already been completed.', ephemeral: true });
        // Optionally disable components if message still exists
        try {
          const disabledComponents = interaction.message.components.map(row => {
            const newRow = ActionRowBuilder.from(row);
            newRow.components.forEach(component => component.setDisabled(true));
            return newRow;
          });
          await interaction.update({ components: disabledComponents });
        } catch (e) {
          if (e.code !== 10008 && e.code !== 10062) { // Ignore if message/interaction gone
            console.error("Error disabling old hope gift menu:", e);
          }
        }
        return;
      }

      // Clear the player timeout
      if (hopeGame.pendingMartyrdom.playerTimeoutId) {
        clearTimeout(hopeGame.pendingMartyrdom.playerTimeoutId);
        hopeGame.pendingMartyrdom.playerTimeoutId = null;
      }

      const recipientId = interaction.values[0];
      const dyingPlayer = hopeGame.players[dyingPlayerId];
      const recipientPlayer = hopeGame.players[recipientId];
      const reason = hopeGame.pendingMartyrdom.reason; // Get the reason
      const dyingCharacterName = dyingPlayer?.name || dyingPlayer?.playerUsername || `<@${dyingPlayerId}>`;
      const recipientCharacterName = recipientPlayer?.name || recipientPlayer?.playerUsername || `<@${recipientId}>`;

      // Double-check data integrity (player still exists, recipient exists and is alive)
      if (!dyingPlayer || !recipientPlayer || dyingPlayer.isDead || recipientPlayer.isDead) {
        await interaction.reply({ content: 'There was an error processing your choice. The recipient may no longer be valid or you might already be marked dead.', ephemeral: true });
        // Clean up and mark dead without transfer if something is wrong
        delete hopeGame.pendingMartyrdom;
        const gameChannel = client.channels.cache.get(channelIdFromMenu);
        if (gameChannel && !dyingPlayer?.isDead) { // Only mark dead if not already marked
          markPlayerDead(hopeGame, dyingPlayerId, reason, gameChannel); // Saves
        } else {
          saveGameData(); // Save anyway to clear pending state
        }
        return;
      }

      if (dyingPlayer.hopeDice <= 0) {
        await interaction.reply({ content: 'You no longer have any Hope Dice to give.', ephemeral: true });
        // Clean up and mark dead without transfer
        delete hopeGame.pendingMartyrdom;
        const gameChannel = client.channels.cache.get(channelIdFromMenu);
        if (gameChannel && !dyingPlayer.isDead) { // Only mark dead if not already marked
          markPlayerDead(hopeGame, dyingPlayerId, reason, gameChannel); // Saves
        } else {
          saveGameData(); // Save anyway to clear pending state
        }
        return;
      }

      // --- Perform the Hope Transfer ---
      dyingPlayer.hopeDice--;
      recipientPlayer.hopeDice++;

      delete hopeGame.pendingMartyrdom;

      console.log(`gift_hope_select: Player ${dyingPlayerId} gifted hope to ${recipientId} in game ${channelIdFromMenu}.`);

      // Update the interaction message (disable select menu)
      try {
        const updatedComponents = interaction.message.components.map(row => {
          const newRow = ActionRowBuilder.from(row);
          newRow.components.forEach(component => component.setDisabled(true));
          return newRow;
        });
        await interaction.update({
          content: `You have chosen to give your final Hope Die to ${recipientCharacterName}.`,
          components: updatedComponents
        });
      } catch (editError) {
        // Ignore if interaction already acknowledged or message deleted
        if (editError.code !== 10062 && editError.code !== 10008) {
          console.error("gift_hope_select: Error updating interaction message:", editError);
        }
      }

      // Announce in the game channel
      const gameChannel = client.channels.cache.get(channelIdFromMenu);
      if (gameChannel) {
        // Announce the hope transfer first
        await gameChannel.send(`In a final act of martyrdom, **${dyingCharacterName}** (<@${dyingPlayerId}>) passes a Hope Die to **${recipientCharacterName}** (<@${recipientId}>)!`).catch(console.error);

        // Send DM to recipient
        try {
          const recipientUser = await client.users.fetch(recipientId);
          await sendDM(recipientUser, `As they died, **${dyingCharacterName}** passed their final Hope Die to you. You now have ${recipientPlayer.hopeDice} Hope ${recipientPlayer.hopeDice === 1 ? 'Die' : 'Dice'}.`);
        } catch (dmError) {
          console.error(`gift_hope_select: Failed to DM recipient ${recipientId}:`, dmError);
          await gameChannel.send(`(Could not notify <@${recipientId}> via DM about receiving the Hope Die.)`).catch(console.error);
        }

        // NOW mark the player dead and check for game end
        markPlayerDead(hopeGame, dyingPlayerId, reason, gameChannel); // This will also save game data

      } else {
        console.error(`gift_hope_select: Could not find game channel ${channelIdFromMenu} for announcement.`);
        // Attempt to notify GM if channel is gone
        try {
          const gmUser = await client.users.fetch(hopeGame.gmId);
          await sendDM(gmUser, `Error: Could not announce Hope Die transfer from ${dyingCharacterName} to ${recipientCharacterName} in channel ${channelIdFromMenu}. The channel might be deleted. Player ${dyingPlayerId} has been marked dead.`);
        } catch (gmDmError) {
          console.error(`gift_hope_select: Failed to notify GM about channel error:`, gmDmError);
        }
        // Still need to mark dead even if channel is gone
        markPlayerDead(hopeGame, dyingPlayerId, reason, null); // Pass null for channel, it will handle it
      }

      return; // Handled hope gifting
    }

    // --- Initial Game Check (for other interactions) ---
    if (!game) {
      // Avoid replying if the interaction is part of an already finished process (e.g., clicking old buttons)
      if (!interaction.deferred && !interaction.replied && !interaction.customId.startsWith('gmstatus_')) { // Don't reply if it was a gmstatus button
        try {
          // Check if the message still exists before replying
          if (interaction.message) {
            await interaction.reply({ content: 'Could not find an active game associated with this action or you are not part of it.', ephemeral: true });
          }
        } catch (error) {
          // Ignore errors like "Unknown interaction" (10062) or "Unknown message" (10008)
          if (error.code !== 10062 && error.code !== 10008) {
            console.warn(`Interaction ${interaction.id}: Failed to send 'no game found' reply: ${error.code} ${error.message}`);
          }
        }
      }
      return;
    }

    // --- Existing Button Interactions (Step 7, Gear, etc.) ---
    if (interaction.isButton()) {
      // const customIdParts = interaction.customId.split('_'); // Already defined above

      // --- Player "Save" / "Send to GM" Button ---
      if (interaction.customId.startsWith('donestep7')) {
        const targetPlayerId = customIdParts[1];
        const textChannelIdFromButton = customIdParts[2];

        // Permission Check: Ensure the interactor is the correct player
        if (interactorId !== targetPlayerId) {
          await interaction.reply({ content: 'You cannot perform this action for another player.', ephemeral: true });
          return;
        }
        // Context Check: Ensure the game context matches the button
        if (!game || game.textChannelId !== textChannelIdFromButton) {
          await interaction.reply({ content: 'Game context mismatch. Cannot perform this action.', ephemeral: true });
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
          // Ignore error if message was already deleted (10008) or interaction expired (10062)
          if (error.code !== 10008 && error.code !== 10062) {
            console.error(`Error deleting inventory message ${interaction.message?.id}:`, error);
          }
        }
        return; // Stop further processing for this interaction

        // --- Player "+ Add Gear" Button ---
      } else if (interaction.customId.startsWith('addgear')) {
        const textChannelIdFromButton = customIdParts[customIdParts.length - 1]; // Usually last part

        // Permission/Context Check (Optional but good practice)
        if (!game || game.textChannelId !== textChannelIdFromButton || !game.players[interactorId]) {
          await interaction.reply({ content: 'Cannot perform this action due to game context mismatch or you are not in this game.', ephemeral: true });
          return;
        }
        // This button just opens a modal, no message deletion or disabling needed here
        await handleAddGearModal(interaction); // Pass game if needed by modal handler
        return; // Stop processing

        // --- Player "Edit Gear" Button (Opens Modal) ---
      } else if (interaction.customId.startsWith('edit_') && interaction.customId.includes('_gear_')) {
        const targetPlayerId = customIdParts[1];
        const textChannelIdFromButton = customIdParts[customIdParts.length - 1]; // Usually last part

        // Permission/Context Check
        if (interactorId !== targetPlayerId) {
          await interaction.reply({ content: 'You cannot edit gear for another player.', ephemeral: true });
          return;
        }
        if (!game || game.textChannelId !== textChannelIdFromButton) {
          await interaction.reply({ content: 'Game context mismatch. Cannot perform this action.', ephemeral: true });
          return;
        }

        const itemId = customIdParts[3];
        await handleEditGearModal(interaction, game, targetPlayerId, itemId);
        return; // Stop processing

        // --- Player "Delete Gear" Button (Opens Modal) ---
      } else if (interaction.customId.startsWith('delete_') && interaction.customId.includes('_gear_')) {
        const targetPlayerId = customIdParts[1];
        const textChannelIdFromButton = customIdParts[customIdParts.length - 1]; // Usually last part

        // Permission/Context Check
        if (interactorId !== targetPlayerId) {
          await interaction.reply({ content: 'You cannot delete gear for another player.', ephemeral: true });
          return;
        }
        if (!game || game.textChannelId !== textChannelIdFromButton) {
          await interaction.reply({ content: 'Game context mismatch. Cannot perform this action.', ephemeral: true });
          return;
        }

        const itemId = customIdParts[3];
        await handleDeleteGearModal(interaction, game, targetPlayerId, itemId);
        return; // Stop processing

        // --- GM "Approve" Inventory Button ---
      } else if (interaction.customId.startsWith('approve_')) {
        const targetPlayerId = customIdParts[1];
        const textChannelId = customIdParts[2];

        // Permission Check: Ensure the interactor is the GM
        if (interactorId !== game.gmId) {
          await interaction.reply({ content: 'Only the GM can approve inventories.', ephemeral: true });
          return;
        }
        // Context Check: Ensure the game context matches the button
        if (!game || game.textChannelId !== textChannelId) {
          await interaction.reply({ content: 'Game context mismatch. Cannot perform this action.', ephemeral: true });
          return;
        }

        const targetPlayer = game.players[targetPlayerId];
        if (!targetPlayer) {
          await interaction.reply({ content: `Error: Could not find player ${targetPlayerId} in game data.`, ephemeral: true });
          return;
        }

        const gearList = targetPlayer.gear && targetPlayer.gear.length > 0 ? targetPlayer.gear.join(', ') : 'No gear added.';
        const characterName = targetPlayer.name || targetPlayer.playerUsername;

        // Reply to the GM first (ephemeral might be better here)
        await interaction.reply({ content: `You have approved (<@${targetPlayerId}>) **${characterName}'s starting inventory**: ${gearList}.`, ephemeral: true });

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
          if (error.code !== 10008 && error.code !== 10062) { // Ignore "Unknown Message" or "Unknown Interaction"
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
            sendCharacterGenStep(gameChannel, game); // Make sure this is imported
          } else {
            console.error(`Could not find game channel ${game.textChannelId} to advance step.`);
            const gmUser = await client.users.fetch(game.gmId).catch(console.error);
            if (gmUser) {
              await gmUser.send(`Error: All inventories approved, but the game channel <#${game.textChannelId}> could not be found. Cannot advance step automatically.`).catch(console.error);
            }
          }
        }
        return; // Stop processing

        // --- GM "Reject" Inventory Button ---
      } else if (interaction.customId.startsWith('tryagain_')) {
        const targetPlayerId = customIdParts[1];
        const textChannelId = customIdParts[2];

        // Permission Check: Ensure the interactor is the GM
        if (interactorId !== game.gmId) {
          await interaction.reply({ content: 'Only the GM can reject inventories.', ephemeral: true });
          return;
        }
        // Context Check: Ensure the game context matches the button
        if (!game || game.textChannelId !== textChannelId) {
          await interaction.reply({ content: 'Game context mismatch. Cannot perform this action.', ephemeral: true });
          return;
        }

        const targetPlayerUser = await client.users.fetch(targetPlayerId).catch(console.error);
        if (!targetPlayerUser) {
          await interaction.reply({ content: `Error: Could not fetch user data for player ${targetPlayerId}.`, ephemeral: true });
          return;
        }
        if (!game.players[targetPlayerId]) {
          await interaction.reply({ content: `Error: Could not find player ${targetPlayerId} in game data.`, ephemeral: true });
          return;
        }

        const characterName = game.players[targetPlayerId].name || game.players[targetPlayerId].playerUsername;

        // Reply to the GM first (ephemeral)
        await interaction.reply({ content: `You have sent (<@${targetPlayerId}>) **${characterName}'s starting inventory** back to them for editing.`, ephemeral: true });

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
          if (error.code !== 10008 && error.code !== 10062) { // Ignore "Unknown Message" or "Unknown Interaction"
            console.error(`Error disabling buttons on GM message ${interaction.message?.id}:`, error);
          }
        }

        // Update game state
        game.players[targetPlayerId].inventoryConfirmed = false; // Mark as not confirmed
        saveGameData();

        // Send the updated inventory display back to the player
        await displayInventory(targetPlayerUser, game, targetPlayerId, true); // Pass true for isRejected
        return; // Stop processing
      }
      // --- Other buttons can be handled here ---
    }
    // --- Modal Submissions ---
    else if (interaction.isModalSubmit()) {
      // Ensure game context is still valid for modal submitter
      if (!game || (!game.players[interactorId] && game.gmId !== interactorId)) {
        // Use ephemeral reply for modals
        await interaction.reply({ content: 'Cannot process modal submission due to missing game context or permissions.', ephemeral: true });
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
      return; // Stop processing
    }
    // --- Select Menu Interactions ---
    else if (interaction.isStringSelectMenu()) {
      if (interaction.customId.startsWith('gearselect_')) {
        const playerIdFromCustomId = interaction.customId.split('_')[1];

        // Permission Check
        if (interactorId !== playerIdFromCustomId) {
          await interaction.reply({ content: 'You cannot interact with another player\'s inventory.', ephemeral: true });
          return;
        }
        // Context Check
        if (!game || !game.players[playerIdFromCustomId]) {
          await interaction.reply({ content: 'Cannot perform this action due to missing game context.', ephemeral: true });
          return;
        }

        const itemId = interaction.values[0]; // This is the index
        const gear = game.players[playerIdFromCustomId].gear;
        const index = parseInt(itemId);

        // Ensure index is valid
        if (isNaN(index) || index < 0 || index >= gear.length) {
          await interaction.reply({ content: 'Invalid item selected.', ephemeral: true });
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

        // Reply with the Edit/Delete options (ephemeral is better here)
        await interaction.reply({
          content: `What would you like to do with **${item}**?`,
          components: [actionRow],
          ephemeral: true
        });
      }
      return; // Stop processing
    }
  }
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  const userId = message.author.id;
  const userName = message.author.username;
  const channelId = message.channel.id; // Keep this for channel messages

  // --- DM Handling ---
  if (message.channel.type === ChannelType.DM) {
    if (message.content.startsWith(BOT_PREFIX)) {
      const args = message.content.slice(BOT_PREFIX.length).split(/ +/);
      const command = args.shift().toLowerCase();

      console.log('DM Command:', message.content, 'from', userName);

      // --- Find the game associated with the user ---
      // We do this once here as multiple DM commands need it.
      const game = findGameByUserId(userId); // Use the user's ID to find their game

      // --- DM Command Logic ---
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
      } else if (command === 'gamestatus') { // DM GM-only command version
        // gmGameStatus already uses findGameByUserId internally
        await gmGameStatus(message);
      } else if (command === 'me') {
        // The 'me' function already uses findGameByUserId
        await me(message);
      } else if (command === 'gear') {
        // *** FIX APPLIED HERE ***
        // const game = gameData[message.channel.id]; // OLD BUGGY LINE
        // Use the 'game' variable found earlier using findGameByUserId
        if (game && game.characterGenStep === 9) { // Check if character gen is complete (step 9 reached)
          // Pass message.author (the User object) and userId (the player's ID)
          await displayInventory(message.author, game, userId, false);
        } else if (game && game.characterGenStep < 9) {
          await message.author.send('You cannot manage your gear until character generation is complete.');
        } else {
          await message.author.send('You are not currently in an active game, or the game hasn\'t started yet.');
        }
      } else if (command === 'x') {
        // *** FIX APPLIED HERE ***
        // Use the 'game' variable found earlier using findGameByUserId
        if (game) {
          try {
            const gameChannel = await client.channels.fetch(game.textChannelId);
            if (gameChannel && gameChannel.isTextBased()) {
              // Send anonymous message to the game channel
              await gameChannel.send('**X-Card Invoked:** A player has signaled a desire to wrap up the current scene or conflict. Please respect this and move towards a conclusion.');
              // Confirm to the user
              await message.author.send('You have anonymously signaled to wrap up the scene. A message has been sent to the game channel.');
            } else {
              console.error(`Could not find or send to game channel ${game.textChannelId} for .x command from ${userId}`);
              await message.author.send('You signaled to wrap up the scene, but I couldn\'t find the game channel to notify others.');
            }
          } catch (error) {
            console.error(`Error handling .x command for game ${game.textChannelId}:`, error);
            await message.author.send('An error occurred while trying to send the wrap-up signal.');
          }
        } else {
          await message.author.send('You are not currently in a game.');
        }
      } else {
        // Handle unknown DM commands if necessary
        await message.author.send(`Unknown command: \`${command}\`. Use \`${BOT_PREFIX}help\` in a server channel for available commands.`);
      }
    } else {
      // Handle non-command DMs (like final recordings)
      await handleFinalRecording(message);
    }
    return; // End DM processing
  }
  // --- Channel Message Handling ---
  else if (message.channel.type !== ChannelType.DM) {
    if (message.content.startsWith(BOT_PREFIX)) {
      const args = message.content.slice(BOT_PREFIX.length).split(/ +/);
      const command = args.shift().toLowerCase();

      console.log('Channel command:', message.content, 'from', userName, 'in #' + message.channel.name); // Use # for channel name

      // --- Admin/Mod Commands (No game context needed initially) ---
      if (command === 'whitelist') {
        try {
          await whitelistChannel(message, args);
        } catch (error) {
          console.error(`Error handling ${command} command:`, error);
          message.channel.send(`An error occurred while processing the ${command} command. Check the console for details.`);
        }
        return; // Whitelist handled, exit
      }
      if (command === 'block') {
        await blockUser(message, args); // Assuming blockUser exists and handles permissions
        return; // Block handled, exit
      }
      if (command === 'unblock') {
        await unblockUser(message, args); // Assuming unblockUser exists and handles permissions
        return; // Unblock handled, exit
      }

      // --- Start Game Command (Special Checks) ---
      if (command === 'startgame') {
        if (isBlockedUser(userId)) {
          await respondViaDM(message, `You are blocked from using the \`${BOT_PREFIX}startgame\` command.`, 'startgame');
          try { await message.delete(); } catch (e) { console.error("Failed to delete blocked startgame command:", e); }
          return;
        }
        if (!isWhitelisted(channelId)) {
          await respondViaDM(message, `The channel <#${channelId}> is not whitelisted for \`${BOT_PREFIX}startgame\` commands. Please ask an administrator to use \`${BOT_PREFIX}whitelist #${channelId}\` to enable games in this channel.`, 'startgame');
          try { await message.delete(); } catch (e) { console.error("Failed to delete non-whitelisted startgame command:", e); }
          return;
        }
        // If not blocked and channel is whitelisted, proceed to startGame
        await startGame(message, gameData); // Pass gameData if needed by startGame
        return; // startGame handled, exit
      }

      // --- Game-Context Commands ---
      const game = getGameData(channelId); // Use channelId for game context commands
      const gameRequiredCommands = ['conflict', 'c', 'nextstep', 'gamestatus', 'removeplayer', 'leavegame', 'cancelgame', 'died', 'theme', 'prevstep']; // Removed 'me', 'x', 'gear' as they are DM only

      if (gameRequiredCommands.includes(command)) {
        if (!game) {
          await respondViaDM(message, `There is no **Ten Candles** game in progress in <#${channelId}>. Use \`${BOT_PREFIX}startgame\` to begin.`, 'gameRequiredCommands');
          try { await message.delete(); } catch (e) { console.error("Failed to delete game-required command in non-game channel:", e); }
          return;
        }
        // Check if the user is the GM or a player in *this specific game*
        if (game.gmId !== userId && !game.players[userId]) {
          await respondViaDM(message, `You are not a participant in the **Ten Candles** game in <#${channelId}>.`, 'gameRequiredCommands');
          try { await message.delete(); } catch (e) { console.error("Failed to delete command from non-participant:", e); }
          return;
        }
      }

      // --- Execute Game Commands ---
      if (command === 'help') {
        const isAdmin = message.member?.permissions.has(PermissionsBitField.Flags.Administrator) ?? false; // Added null check for member
        const helpEmbed = getHelpEmbed(isAdmin, message); // Pass message for context if needed
        await message.channel.send({ embeds: [helpEmbed.help] });
      } else if (command === 'conflict' || command === 'c') {
        await conflict(message, args, gameData); // Pass gameData if needed
      } else if (command === 'theme') {
        await setTheme(message, args);
      } else if (command === 'nextstep') {
        // Assuming nextStep exists and handles GM check
        await nextStep(message);
      } else if (command === 'prevstep') {
        await prevStep(message);
      } else if (command === 'gamestatus') {
        // The channel version of gameStatus
        await gameStatus(message);
      } else if (command === 'removeplayer') {
        await removePlayer(message, args);
      } else if (command === 'leavegame') {
        await leaveGame(message, args);
      } else if (command === 'cancelgame') {
        await cancelGame(message);
      } else if (command === 'died') {
        await died(message, args);
      }
      // Add other channel-specific commands here if any
      // Note: .me, .x, .gear are handled in the DM section now.
    }
  }
});

// Make sure the 'me' function is defined correctly (it was already mostly correct)
async function me(message) {
  const playerId = message.author.id;

  // This check should ideally be done *before* calling the function,
  // but we'll keep it here for robustness.
  if (message.channel.type !== ChannelType.DM) {
    try {
      await message.delete();
      await message.author.send({ content: `The \`${BOT_PREFIX}me\` command can only be used in a direct message.` });
    } catch (error) {
      console.error('Could not send DM to user or delete message:', error);
    }
    return;
  }

  const game = findGameByUserId(playerId); // Use the correct function

  if (!game) {
    await message.author.send(`You are not currently in a game.`);
    return;
  }

  const player = game.players[playerId];
  // No need to find gameChannelId again if we already have the game object
  const gameChannelId = game.textChannelId;

  if (!player) {
    // This case might happen if the user is the GM but not a player
    // Or if data is somehow corrupted.
    await message.author.send(`Could not find your player data in the game <#${gameChannelId}>.`);
    return;
  }

  // Use the generatePlayerStatusEmbed function for consistency
  const characterEmbed = generatePlayerStatusEmbed(game, playerId); // Assuming this function is available or imported

  // Add game-specific info if needed, or keep it focused on the player
  characterEmbed.addFields(
    { name: 'Session Theme', value: game.theme || 'Not set' },
    { name: 'Active Game Channel', value: `<#${gameChannelId}>` }
  );

  try {
    await message.author.send({ embeds: [characterEmbed] });
  } catch (error) {
    console.error(`Could not send character sheet DM to ${message.author.tag}: `, error.message);
    // Optionally try to inform the user in the original channel if DM fails, but that's tricky from a DM context.
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

// Make sure handleFinalRecording is defined or imported
async function handleFinalRecording(message) {
  const userId = message.author.id;
  const game = findGameByUserId(userId);

  if (!game) return; // Not in a game
  // Only process if in the correct step OR if the game is in last stand/ended and recordings are missing
  const player = game.players[userId];
  if (!player) return; // Not a player in this game

  // Allow recording submission during step 8 OR if the game ended but this player's recording is missing
  const canSubmitRecording = game.characterGenStep === 8 ||
    (game.inLastStand && !player.recording) ||
    (game.endGame && !player.recording); // endGame might be set by cancelGame

  if (!canSubmitRecording) return; // Not the right time to submit

  let recordingContent = null;
  let isAudio = false;

  if (message.attachments.size > 0) {
    const attachment = message.attachments.first();
    // Basic check for audio mime types - might need refinement
    if (attachment.contentType && attachment.contentType.startsWith('audio/')) {
      recordingContent = attachment.url;
      isAudio = true;
      console.log(`Received audio recording from ${userId}: ${recordingContent}`);
    } else {
      await message.author.send("Invalid attachment type. Please send an audio file or a text message for your final recording.");
      return;
    }
  } else if (message.content.trim()) {
    recordingContent = sanitizeString(message.content.trim()); // Sanitize text input
    isAudio = false;
    console.log(`Received text recording from ${userId}: "${recordingContent}"`);
  } else {
    // Ignore empty messages
    return;
  }

  if (!recordingContent) {
    await message.author.send("Could not process your recording. Please try again.");
    return;
  }

  // Store the recording (URL or text)
  player.recording = recordingContent; // Overwrite previous if resubmitted

  // Confirmation prompt
  const confirmation = await requestConsent(
    message.author,
    `Is this your final recording?\n${isAudio ? `(Audio file: ${message.attachments.first().name})` : `"${recordingContent.substring(0, 100)}${recordingContent.length > 100 ? '...' : ''}"`}`,
    `final_rec_yes_${userId}_${game.textChannelId}`, // Unique IDs
    `final_rec_no_${userId}_${game.textChannelId}`,
    60000, // Timeout
    'Final Recording Confirmation'
  );

  if (confirmation === true) { // Explicitly check for true
    await message.author.send('Your final recording has been saved.');
    saveGameData(); // Save the recording

    // Check if all players now have recordings *if* the game is in the final stages
    if (game.inLastStand || game.endGame || game.characterGenStep === 8) { // Check if ready to proceed
      const allPlayersHaveRecordings = game.playerOrder.every(pId => game.players[pId]?.recording);
      if (allPlayersHaveRecordings) {
        const gameChannel = client.channels.cache.get(game.textChannelId);
        if (gameChannel) {
          if (game.characterGenStep === 8) {
            // If we were waiting in step 8, advance
            clearReminderTimers(game); // Clear step 8 timers
            game.characterGenStep++;
            saveGameData();
            await sendCharacterGenStep(gameChannel, game); // Move to step 9
          } else if (game.inLastStand && !game.endGame) {
            // If in last stand and all recordings are in, play them
            await playRecordings(gameChannel); // Pass channel instead of message
          }
          // If game.endGame is true, playRecordings might be called by cancelGame or similar logic
        } else {
          console.error(`Cannot proceed after final recording: Game channel ${game.textChannelId} not found.`);
          const gmUser = await client.users.fetch(game.gmId).catch(console.error);
          if (gmUser) {
            await gmUser.send(`All final recordings received for game in ${game.textChannelId}, but the channel could not be found to proceed.`).catch(console.error);
          }
        }
      }
    }
  } else if (confirmation === false) { // Explicitly check for false
    player.recording = ''; // Clear the recording if they said no
    saveGameData();
    await message.author.send('Okay, your previous recording attempt has been discarded. Please send your final recording again when ready.');
  } else {
    // Handle timeout or error from requestConsent if necessary
    // Currently, requestConsent sends its own timeout message.
    // We might want to clear the recording here too if it timed out.
    player.recording = ''; // Clear on timeout as well
    saveGameData();
    console.log(`Recording confirmation timed out or failed for user ${userId}. Recording discarded.`);
  }
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

export async function playRecordings(channel) {
  // Use channel.id to get game data
  const channelId = channel.id;
  const game = getGameData(channelId);

  if (!game) {
    console.error(`playRecordings: No game data found for channel ${channelId}`);
    try {
      await channel.send("Error: Could not find game data to play recordings.");
    } catch (e) {
      console.error(`playRecordings: Failed to send error message to channel ${channelId}`);
    }
    return;
  }

  // Prevent multiple simultaneous playback attempts for the same game
  if (game.playingRecordings) {
    console.log(`playRecordings: Recordings are already being played for game ${channelId}. Aborting.`);
    return;
  }
  game.playingRecordings = true; // Set flag
  // Don't save immediately, save at the end in finally

  try {
    console.log(`playRecordings: Starting playback for game in channel ${channelId}`);
    await channel.send(finalRecordingsMessage); // "The final scene fades to black..."

    // Initial "moment of silence" - using await with setTimeout
    await new Promise(resolve => setTimeout(resolve, 10000)); // 10-second initial pause

    // --- Voice Connection Setup (once before the loop) ---
    let connection = getVoiceConnection(game.guildId);
    let voiceChannel = null;
    const canAttemptAudio = game.gameMode === 'voice-plus-text' && game.voiceChannelId;
    let canPlayAudio = false; // Assume false initially

    if (canAttemptAudio) {
      voiceChannel = client.channels.cache.get(game.voiceChannelId);
      if (voiceChannel && voiceChannel.type === ChannelType.GuildVoice) {
        if (!connection) {
          try {
            console.log(`playRecordings: Attempting to join voice channel ${voiceChannel.name} (${game.voiceChannelId})`);
            connection = joinVoiceChannel({
              channelId: game.voiceChannelId,
              guildId: game.guildId,
              adapterCreator: voiceChannel.guild.voiceAdapterCreator,
              selfDeaf: false, // Ensure bot is not deaf
              selfMute: false  // Ensure bot is not muted
            });
            await new Promise(resolve => setTimeout(resolve, 500)); // Short delay for connection
            // Re-verify connection after attempting to join
            connection = getVoiceConnection(game.guildId);
            if (connection) {
              console.log(`playRecordings: Successfully joined voice channel ${voiceChannel.name}.`);
              canPlayAudio = true;
            } else {
              console.error(`playRecordings: Failed to establish voice connection after join attempt.`);
              await channel.send("⚠️ Error establishing voice connection. Audio recordings will be linked/shown as text.");
            }
          } catch (error) {
            console.error(`playRecordings: Failed to join voice channel ${game.voiceChannelId}:`, error);
            await channel.send("⚠️ Error joining voice channel. Audio recordings will be linked/shown as text.");
          }
        } else {
          console.log(`playRecordings: Bot already connected to a voice channel in this guild.`);
          // Check if it's the *correct* channel, though usually not necessary if managed properly
          if (connection.joinConfig.channelId === game.voiceChannelId) {
            canPlayAudio = true;
          } else {
            console.warn(`playRecordings: Bot is in a different voice channel (${connection.joinConfig.channelId}) than expected (${game.voiceChannelId}). Audio might not play correctly.`);
            // Decide if you want to try and switch channels or just disable audio playback
            // For simplicity here, we'll assume if it's connected elsewhere, we won't play audio.
            canPlayAudio = false;
            await channel.send("⚠️ Bot is currently in a different voice channel. Audio recordings will be linked/shown as text.");
          }
        }
      } else {
        await channel.send(`⚠️ Could not find the designated voice channel <#${game.voiceChannelId}> or it's not a voice channel. Audio recordings will be linked/shown as text.`);
      }
    }
    // --- End Voice Connection Setup ---

    // Iterate through players in the original order
    for (const playerId of game.playerOrder) {
      const player = game.players[playerId];

      // Check if the player exists and has a recording
      if (!player || !player.recording) {
        console.log(`playRecordings: Skipping player ${playerId} - no data or recording found.`);
        // Optionally send a message indicating skip
        // await channel.send(`*(Skipping player <@${playerId}> - no recording found)*`);
        await new Promise(resolve => setTimeout(resolve, 500)); // Small pause even if skipping
        continue; // Skip this player
      }

      // Fetch user for display name (handle potential errors)
      let user;
      try {
        user = await client.users.fetch(playerId);
      } catch (fetchError) {
        console.warn(`playRecordings: Could not fetch user ${playerId}. Using stored username.`);
      }
      const playerName = player.name || player.playerUsername || (user ? user.username : `Player ${playerId}`);

      // Announce whose recording is playing
      await channel.send(`***Now playing the final recording from ${playerName}...***`);
      await new Promise(resolve => setTimeout(resolve, 1500)); // Short pause before content

      const recordingContent = player.recording;
      const isAudioUrl = typeof recordingContent === 'string' && (recordingContent.startsWith('http://') || recordingContent.startsWith('https://')); // Basic URL check

      let playbackDuration = 3000; // Default pause after playback

      if (isAudioUrl) {
        // --- Handle Audio Recording (URL) ---
        if (canPlayAudio && voiceChannel) {
          try {
            await channel.send(`*(Playing audio in <#${game.voiceChannelId}>)*`);
            await playAudioFromUrl(recordingContent, voiceChannel);
            // No need to estimate duration here, playAudioFromUrl waits
            playbackDuration = 1000; // Shorter pause after successful audio playback
          } catch (audioError) {
            console.error(`playRecordings Error: Failed to play audio URL for ${playerName} (${playerId}) from ${recordingContent}:`, audioError);
            await channel.send(`*(Error playing audio recording. Link: ${recordingContent})*`);
          }
        } else {
          // Cannot play audio (text-only mode, no connection, or no voice channel)
          await channel.send(`*(Audio recording found but cannot be played automatically. Link: ${recordingContent})*`);
          // Try to get duration for text-only mode pause (best effort)
          // Note: getAudioDuration might not work for all URLs, especially non-YouTube
          // const duration = await getAudioDuration(recordingContent).catch(() => null);
          // if (duration) playbackDuration = duration + 1000; // Add buffer
        }
      } else if (typeof recordingContent === 'string' && recordingContent.trim().length > 0) {
        // --- Handle Text Recording ---
        // Display the text in the channel
        await channel.send(`> ${recordingContent.replace(/\n/g, '\n> ')}`); // Format as blockquote

        // Check if TTS should be used
        if (canPlayAudio && voiceChannel && player.language && player.voice) {
          try {
            await channel.send(`*(Speaking text via TTS in <#${game.voiceChannelId}>)*`);
            await speakInChannel(recordingContent, voiceChannel, player.voice);
            playbackDuration = 1000; // Shorter pause after successful TTS
          } catch (ttsError) {
            console.error(`playRecordings Error: Failed to speak text for ${playerName} (${playerId}):`, ttsError);
            await channel.send(`*(Error speaking recording via TTS.)*`);
          }
        }
        // If not using TTS, the default 3-second pause applies
      } else {
        // Handle cases where recording might be empty or invalid format after checks
        await channel.send(`*(No valid recording content found for ${playerName})*`);
      }

      // Pause between different players' recordings
      await new Promise(resolve => setTimeout(resolve, playbackDuration));

    } // End of player loop

    await channel.send('**...silence falls.**\n\n*The story has ended.*');
    game.endGame = true; // Mark the game as officially concluded in the data

    // Notify GM about next steps (cleanup)
    try {
      const gmUser = await client.users.fetch(game.gmId);
      await sendDM(gmUser, `The final recordings for the game in <#${channelId}> have finished playing. The game is now marked as ended. You can use \`${BOT_PREFIX}cancelgame\` in the channel to manage the game data (save or delete).`);
    } catch (gmError) {
      console.error(`playRecordings: Failed to notify GM ${game.gmId} about game end:`, gmError);
    }

  } catch (error) {
    console.error(`playRecordings: An unexpected error occurred during playback for game ${channelId}:`, error);
    try {
      await channel.send('An unexpected error occurred while trying to play the final recordings.');
    } catch (e) {
      console.error(`playRecordings: Failed to send final error message to channel ${channelId}`);
    }
  } finally {
    // Ensure the flag is cleared and data is saved even if errors occurred
    if (game) {
      delete game.playingRecordings; // Clear the flag
      saveGameData(); // Save the final state (including game.endGame = true)
      console.log(`playRecordings: Finished playback process for game ${channelId}.`);
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