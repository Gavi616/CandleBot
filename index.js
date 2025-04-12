import 'dotenv/config';
import {
  Client, EmbedBuilder, ChannelType, GatewayIntentBits, MessageMentions, ModalBuilder, TextInputBuilder,
  TextInputStyle, ActionRowBuilder, ButtonStyle, PermissionsBitField, AttachmentBuilder,
  MessageFlags, StringSelectMenuBuilder, ButtonBuilder, ComponentType
} from 'discord.js';
import fs from 'fs';
import { getHelpEmbed } from './embed.js';
import {
  BOT_PREFIX, TEST_USER_ID, DEFAULT_LIT_CANDLE_EMOJI, DEFAULT_UNLIT_CANDLE_EMOJI, finalRecordingsMessage
} from './config.js';
import {
  loadGameData, saveGameData, printActiveGames, getGameData, sendCandleStatus, getLitCandleEmoji,
  gameData, playAudioFromUrl, playRandomConflictSound, handleEditGearModal, getUnlitCandleEmoji,
  speakInChannel, requestConsent, loadBlockUserList, isWhitelisted, handleAddGearModal,
  handleAddGearModalSubmit, isBlockedUser, loadChannelWhitelist, saveChannelWhitelist,
  channelWhitelist, respondViaDM, findGameByUserId, normalizeBrink, getRandomBrink,
  getRandomMoment, getRandomVice, getRandomVirtue, getRandomName, getRandomLook, getRandomConcept,
  handleDoneButton, handleDeleteGearModal, handleDeleteGearModalSubmit, handleEditGearModalSubmit,
  displayInventory, markPlayerDead, askPlayerToGiftHope, sendDM, clearReminderTimers
} from './utils.js';
import { prevStep, sendCharacterGenStep } from './steps.js';
import { startGame } from './commands/startgame.js';
import { conflict, extinguishCandle } from './commands/conflict.js';
import { generatePlayerStatusEmbed, generateGameStatusEmbed } from './commands/gamestatus.js';
import { removePlayer } from './commands/removeplayer.js';
import { leaveGame } from './commands/leavegame.js';
import { cancelGame } from './commands/cancelgame.js';
import { died } from './commands/died.js';
import { gameStatus } from './commands/gamestatus.js';
import { getVoiceConnection, joinVoiceChannel } from '@discordjs/voice';

export const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers, GatewayIntentBits.DirectMessages, GatewayIntentBits.GuildMessageReactions, GatewayIntentBits.GuildVoiceStates] });

const version = '0.9.960a';
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
          } else { // scene play continues
            await gameStatus(channel);
            await sendCandleStatus(channel, 11 - game.scene);
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

    // --- NEW: Sacrifice Button Handling (Player) ---
    if (interaction.isButton() && interaction.customId.startsWith('sacrifice_')) {
      // customId format: sacrifice_yes/no_<playerId>_<channelId>
      const parts = interaction.customId.split('_');
      const type = parts[1]; // 'yes' or 'no'
      const playerId = parts[2];
      const channelIdFromButton = parts[3];

      // Permission Check: Must be the player the prompt was for
      if (interaction.user.id !== playerId) {
        await interaction.reply({ content: 'You cannot respond to another player\'s sacrifice prompt.', ephemeral: true });
        return;
      }
      // Context Check
      if (game.textChannelId !== channelIdFromButton) {
        await interaction.reply({ content: 'Game context mismatch.', ephemeral: true });
        return;
      }
      // Ensure player exists and is alive (might be redundant if prompt was recent, but safe)
      const player = game.players[playerId];
      if (!player || player.isDead) {
        await interaction.reply({ content: 'Cannot process sacrifice: Player not found or already dead.', ephemeral: true });
        return;
      }

      // Disable buttons on the original DM
      try {
        const disabledRows = interaction.message.components.map(row => {
          const newRow = ActionRowBuilder.from(row);
          newRow.components.forEach(component => component.setDisabled(true));
          return newRow;
        });
        await interaction.update({ components: disabledRows }); // Update original interaction first
      } catch (e) {
        if (e.code !== 10062 && e.code !== 10008) { // Ignore interaction/message already gone
          console.error("Sacrifice Button: Error disabling buttons:", e);
        }
        // Don't return yet, try to proceed if possible
      }


      if (type === 'yes') {
        // --- Player chose YES to Sacrifice ---
        console.log(`Sacrifice Button: Player ${playerId} chose YES in game ${channelIdFromButton}. Showing reason modal.`);

        // Build and show the modal
        const reasonModal = new ModalBuilder()
          .setCustomId(`sacrifice_reason_${playerId}_${channelIdFromButton}`) // Include player/channel ID
          .setTitle('Describe Your Sacrifice');
        const reasonInput = new TextInputBuilder()
          .setCustomId('sacrificeReasonInput')
          .setLabel("Reason/Final Action (Optional)")
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder("Briefly describe your character's final moments...")
          .setRequired(false);
        const actionRow = new ActionRowBuilder().addComponents(reasonInput);
        reasonModal.addComponents(actionRow);

        try {
          await interaction.showModal(reasonModal);
          // The rest of the logic (martyrdom, death, scene change) happens in the modal submit handler below
        } catch (modalError) {
          console.error(`Sacrifice Button: Error showing modal to ${playerId}:`, modalError);
          // Fallback: If modal fails, proceed with default reason and scene change
          await interaction.followUp({ content: "Error showing reason input form. Proceeding with default reason.", ephemeral: true }).catch(console.error);
          markPlayerDead(game, playerId, "Sacrificed for narrative control (Modal Error)", null); // Mark dead (no channel needed here)
          const gameChannel = client.channels.cache.get(channelIdFromButton);
          if (gameChannel) {
            await gameChannel.send(`:skull: <@${playerId}> chooses to make the ultimate sacrifice! (Modal Error)`);
            await extinguishCandle({ channel: gameChannel }, channelIdFromButton); // Trigger scene change
          } else {
            saveGameData(); // Save death at least
          }
        }

      } else { // type === 'no'
        // --- Player chose NO to Sacrifice ---
        console.log(`Sacrifice Button: Player ${playerId} chose NO in game ${channelIdFromButton}. Triggering scene change.`);
        // Announce choice in channel
        const gameChannel = client.channels.cache.get(channelIdFromButton);
        if (gameChannel) {
          // Simply trigger a scene change
          await extinguishCandle({ channel: gameChannel }, channelIdFromButton); // Pass a mock message object
        } else {
          console.error(`Sacrifice Button: Could not find game channel ${channelIdFromButton} to announce 'no' or change scene.`);
          saveGameData(); // Save anyway? Maybe not needed if nothing changed.
        }
      }
      return; // Handled sacrifice button
    }

    // --- NEW: Sacrifice Reason Modal Submit Handling ---
    if (interaction.isModalSubmit() && interaction.customId.startsWith('sacrifice_reason_')) {
      // customId format: sacrifice_reason_<playerId>_<channelId>
      const parts = interaction.customId.split('_');
      const playerId = parts[2];
      const channelIdFromModal = parts[3];

      // Permission Check: Must be the player who submitted
      if (interaction.user.id !== playerId) {
        await interaction.reply({ content: 'Invalid user for this modal submission.', ephemeral: true });
        return;
      }
      // Context Check
      if (game.textChannelId !== channelIdFromModal) {
        await interaction.reply({ content: 'Game context mismatch.', ephemeral: true });
        return;
      }
      const player = game.players[playerId];
      if (!player || player.isDead) {
        await interaction.reply({ content: 'Cannot process sacrifice reason: Player not found or already dead.', ephemeral: true });
        return;
      }

      // Get the reason from the modal
      const reasonInput = interaction.fields.getTextInputValue('sacrificeReasonInput');
      const sacrificeReason = sanitizeString(reasonInput.trim()) || "Sacrificed for narrative control"; // Use default if empty

      console.log(`Sacrifice Modal: Received reason "${sacrificeReason}" from ${playerId} for game in ${channelIdFromModal}.`);

      // Acknowledge modal submission quickly
      await interaction.reply({ content: `Sacrifice reason received. Processing...`, ephemeral: true });

      // --- Now continue with Martyrdom Check ---
      let martyrdomGranted = false; // Flag
      if (player.hopeDice > 0) {
        const gmMember = await client.guilds.cache.get(game.guildId)?.members.fetch(game.gmId).catch(() => null);
        if (gmMember) {
          const gmConfirm = await requestConsent(
            gmMember.user,
            `<@${playerId}> (${player.name || player.playerUsername}) failed a conflict and chose to sacrifice.\nReason: ${sacrificeReason}\n\nDoes this act of sacrifice count as Martyrdom...?`,
            `martyr_confirm_yes_${playerId}_${channelIdFromModal}`, // Use correct IDs
            `martyr_confirm_no_${playerId}_${channelIdFromModal}`,
            MARTYRDOM_TIMEOUT,
            `Confirm Martyrdom...?`
          );
          // Store the reason in the pendingMartyrdom state (if it exists)
          if (game.pendingMartyrdom && game.pendingMartyrdom.dyingPlayerId === playerId) {
            game.pendingMartyrdom.reason = sacrificeReason;
            saveGameData(); // Save the reason
            console.log(`Sacrifice Modal: Stored reason "${sacrificeReason}" in pendingMartyrdom for ${playerId}. Waiting for GM confirmation.`);
            // Inform player we're waiting for GM
            await interaction.followUp({ content: "Reason recorded. Waiting for GM confirmation on Martyrdom before proceeding.", ephemeral: true }).catch(console.error);
          } else {
            // This case shouldn't happen if flow is correct, but handle it.
            // GM confirmation might have timed out already, or state is weird.
            console.warn(`Sacrifice Modal: pendingMartyrdom state missing or mismatched for ${playerId}. Proceeding with death using submitted reason.`);
            await interaction.followUp({ content: "Reason recorded, but couldn't find pending Martyrdom state. Proceeding with death.", ephemeral: true }).catch(console.error);
            const gameChannel = client.channels.cache.get(channelIdFromModal);
            if (gameChannel) {
              await gameChannel.send(`:skull: <@${playerId}> makes the ultimate sacrifice!`); // Announce
              markPlayerDead(game, playerId, sacrificeReason, gameChannel); // Mark dead (saves)
              await extinguishCandle({ channel: gameChannel }, channelIdFromModal); // Trigger scene change
            } else {
              markPlayerDead(game, playerId, sacrificeReason, null); // Mark dead (saves)
            }
          }
        } else { // Couldn't find GM
          await interaction.followUp({ content: "Reason recorded, but could not contact GM for Martyrdom confirmation. Proceeding with death.", ephemeral: true }).catch(console.error);
          const gameChannel = client.channels.cache.get(channelIdFromModal);
          if (gameChannel) {
            await gameChannel.send(`:skull: <@${playerId}> makes the ultimate sacrifice! (Could not reach GM for Martyrdom check)`); // Announce
            markPlayerDead(game, playerId, sacrificeReason, gameChannel); // Mark dead (saves)
            await extinguishCandle({ channel: gameChannel }, channelIdFromModal); // Trigger scene change
          } else {
            markPlayerDead(game, playerId, sacrificeReason, null); // Mark dead (saves)
          }
        }
      } else { // Player had no hope dice
        await interaction.followUp({ content: "Reason recorded. Proceeding with death (no Martyrdom possible).", ephemeral: true }).catch(console.error);
        const gameChannel = client.channels.cache.get(channelIdFromModal);
        if (gameChannel) {
          await gameChannel.send(`:skull: <@${playerId}> makes the ultimate sacrifice!`); // Announce
          markPlayerDead(game, playerId, sacrificeReason, gameChannel); // Mark dead (saves)
          await extinguishCandle({ channel: gameChannel }, channelIdFromModal); // Trigger scene change
        } else {
          markPlayerDead(game, playerId, sacrificeReason, null); // Mark dead (saves)
        }
      }
      return; // Handled modal submit
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
      } else if (isTesting && command === 'testgameplay') {
        await testGameplay(message, args);
      } else if (isTesting && command === 'testtts') {
        await testTTS(message, args);
      } else if (isTesting && command === 'testdice') {
        await testDiceSounds(message, args);
      } else if (isTesting && command === 'testfinalrec') {
        await testRecordingCommand(message, args);
      } else if (command === 'gamestatus') { // DM GM-only command version
        await gmGameStatus(message);
      } else if (command === 'me') {
        await me(message);
      } else if (command === 'gear') {
        if (game && game.characterGenStep === 9) {
          await displayInventory(message.author, game, userId, false);
        } else if (game && game.characterGenStep < 9) {
          await message.author.send('You cannot manage your gear until character generation is complete.');
        } else {
          await message.author.send('You are not currently in an active game, or the game hasn\'t started yet.');
        }
      } else if (command === 'x') {
        if (game) {
          try {
            const gameChannel = await client.channels.fetch(game.textChannelId);
            if (gameChannel && gameChannel.isTextBased()) {
              // Send anonymous message to the game channel
              await gameChannel.send('**X-Card Invoked:** A player or the GM has signaled a desire to wrap up the current scene or conflict. Please respect this and move towards a conclusion.');
              // Confirm to the user
              await message.author.send('You have signaled to wrap up the scene. An anonymous message has been sent to the game channel.');
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
      // Add other channel-specific non-DM commands here
    }
  }
});

async function me(message) {
  const playerId = message.author.id;

  // This check should ideally be done *before* calling the function,
  if (message.channel.type !== ChannelType.DM) {
    try {
      await message.delete();
      await message.author.send({ content: `The \`${BOT_PREFIX}me\` command can only be used in a direct message.` });
    } catch (error) {
      console.error('Could not send DM to user or delete message:', error);
    }
    return;
  }

  const game = findGameByUserId(playerId);

  if (!game) {
    await message.author.send(`You are not currently in a game.`);
    return;
  }

  const player = game.players[playerId];
  const gameChannelId = game.textChannelId;

  if (!player) {
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
  // --- Permission Checks
  if (!message.member.permissions.has('Administrator') && !message.member.permissions.has('KickMembers')) {
    // ... permission denied handling ...
    return;
  }

  // --- Argument Parsing ---
  if (args.length < 1) {
    try {
      await message.author.send(`Usage: \`${BOT_PREFIX}whitelist <#channel|channelID> [remove] [LIT=<emoji>] [UNLIT=<emoji>]\``);
      await message.delete();
    } catch (error) { /* ignore */ }
    return;
  }

  const channelInput = args[0];
  const removeFlag = args[1]?.toLowerCase() === 'remove';
  const emojiArgStartIndex = removeFlag ? 2 : 1; // Start looking for emoji args after channelId or -remove

  let litEmojiInput = null;
  let unlitEmojiInput = null;

  // Parse key-value emoji arguments
  for (let i = emojiArgStartIndex; i < args.length; i++) {
    const argLower = args[i].toLowerCase();
    if (argLower.startsWith('lit=')) {
      litEmojiInput = args[i].substring(4); // Get value after 'LIT='
    } else if (argLower.startsWith('unlit=')) {
      unlitEmojiInput = args[i].substring(6); // Get value after 'UNLIT='
    }
  }

  // --- Channel Validation
  const channelToWhitelistId = parseChannelId(channelInput);
  if (!channelToWhitelistId) { /* ... invalid channel handling ... */ return; }
  let channel = await client.channels.fetch(channelToWhitelistId).catch(() => null);
  if (!channel) { /* ... channel not found handling ... */ return; }
  const guild = channel.guild;
  if (!guild) { /* ... no guild handling ... */ return; }

  let dmText = '';
  let channelText = '';
  let customLitEmojiString = null; // Store the validated full emoji string
  let customUnlitEmojiString = null; // Store the validated full emoji string
  let emojiFeedback = '';
  const emojiRegex = /<(a)?:(\w+):(\d+)>/; // Regex for custom emojis (animated or static)

  // --- Emoji Processing Function (Helper) ---
  const processEmoji = (input, type, defaultEmoji) => {
    if (!input) return { feedback: ` ${type}: Default ${defaultEmoji}.`, value: null };

    const match = input.match(emojiRegex);
    if (match) {
      const emojiId = match[3];
      if (guild.emojis.cache.has(emojiId)) {
        console.log(`whitelistChannel: Valid custom ${type} emoji ${input} found for channel ${channelToWhitelistId}.`);
        return { feedback: ` ${type}: ${input}`, value: input };
      } else {
        console.warn(`whitelistChannel: Custom ${type} emoji ${input} (ID: ${emojiId}) not found on server ${guild.name}.`);
        return { feedback: ` ${type} emoji ${input} not found on server **${guild.name}**. Using default ${defaultEmoji}.`, value: null };
      }
    } else {
      console.warn(`whitelistChannel: Invalid ${type} emoji format "${input}" for channel ${channelToWhitelistId}.`);
      return { feedback: ` Invalid ${type} emoji format "${input}". Using default ${defaultEmoji}.`, value: null };
    }
  };

  // --- Process Emojis if Adding/Updating ---
  if (!removeFlag) {
    const litResult = processEmoji(litEmojiInput, 'Lit', DEFAULT_LIT_CANDLE_EMOJI);
    const unlitResult = processEmoji(unlitEmojiInput, 'Unlit', DEFAULT_UNLIT_CANDLE_EMOJI);

    customLitEmojiString = litResult.value;
    customUnlitEmojiString = unlitResult.value;
    emojiFeedback = ` Using emojis:${litResult.feedback};${unlitResult.feedback}`;
  }

  // --- Add/Update/Remove Logic ---
  if (removeFlag) {
    // --- Remove Whitelist ---
    if (channelWhitelist[channelToWhitelistId]) {
      delete channelWhitelist[channelToWhitelistId];
      saveChannelWhitelist();
      dmText = `**<#${channelToWhitelistId}>** has been removed from the channel whitelist.`;
      channelText = `This ${channelType} channel has been removed from the whitelist for ${client.user.username} by <@${message.author.id}>.`;
    } else {
      dmText = `**<#${channelToWhitelistId}>** was not on the channel whitelist.`;
    }
  } else {
    // --- Add/Update Whitelist ---
    const alreadyWhitelisted = isWhitelisted(channelToWhitelistId);
    channelWhitelist[channelToWhitelistId] = {
      whitelisted: true,
      customLitCandle: customLitEmojiString, // Store validated lit emoji string or null
      customUnlitCandle: customUnlitEmojiString // Store validated unlit emoji string or null
    };
    saveChannelWhitelist();

    if (alreadyWhitelisted) {
      dmText = `**<#${channelToWhitelistId}>** whitelist updated.${emojiFeedback}`;
    } else {
      dmText = `**<#${channelToWhitelistId}>** has been added to the channel whitelist.${emojiFeedback}`;
      channelText = `This ${channelType} channel has been whitelisted for ${client.user.username} by <@${message.author.id}>. Use the \`${BOT_PREFIX}startgame\` command to begin a session.`;
    }
  }

  // --- Send Feedback ---
  try { await message.author.send(dmText); } catch (error) { console.error('whitelistChannel: Failed to send DM:', error); }
  try { await message.delete(); } catch (error) { /* ignore */ }
  if (channelText) {
    try { await channel.send(channelText); } catch (error) { console.error(`whitelistChannel: Failed to send message to channel ${channelToWhitelistId}:`, error); }
  }
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

  // --- DEFENSIVE CHECKS ---
  if (!game) {
    // console.log(`handleFinalRecording: User ${userId} sent DM but is not in a game. Ignoring.`);
    return;
  }

  const player = game.players[userId];
  if (!player) {
    // console.log(`handleFinalRecording: User ${userId} sent DM but is not a player in game ${game.textChannelId}. Ignoring.`);
    return;
  }

  // Allow recording submission ONLY during step 8.
  const canSubmitRecording = game.characterGenStep === 8;

  if (!canSubmitRecording) {
    // If it's not step 8, ignore the DM.
    console.log(`handleFinalRecording: Received DM from ${userId} for game ${game.textChannelId}, but it's not Step 8 (Current: ${game.characterGenStep}). Ignoring.`);
    return;
  }

  // --- Original Recording Logic ---
  console.log(`handleFinalRecording: Processing potential recording DM from ${userId} for game ${game.textChannelId} (Step 8).`);

  let recordingContent = null;
  let isAudio = false;

  // ... (logic for handling attachments/text) ...
  if (message.attachments.size > 0) {
    const attachment = message.attachments.first();
    if (attachment.contentType && attachment.contentType.startsWith('audio/')) {
      recordingContent = attachment.url;
      isAudio = true;
      console.log(`Received audio recording from ${userId}: ${recordingContent}`);
    } else {
      await message.author.send("Invalid attachment type. Please send an audio file or a text message for your final recording.");
      return;
    }
  } else if (message.content.trim()) {
    recordingContent = sanitizeString(message.content.trim());
    isAudio = false;
    console.log(`Received text recording from ${userId}: "${recordingContent}"`);
  } else {
    return; // Ignore empty messages
  }

  if (!recordingContent) {
    await message.author.send("Could not process your recording. Please try again.");
    return;
  }

  // Store the recording (URL or text) - using 'recordings' field
  player.recordings = recordingContent; // Overwrite previous if resubmitted

  // Confirmation prompt
  const confirmation = await requestConsent(
    message.author,
    `Is this your final recording?\n${isAudio ? `(Audio file: ${message.attachments.first().name})` : `"${recordingContent.substring(0, 100)}${recordingContent.length > 100 ? '...' : ''}"`}`,
    `final_rec_yes_${userId}_${game.textChannelId}`,
    `final_rec_no_${userId}_${game.textChannelId}`,
    60000, // Timeout
    'Final Recording Confirmation'
  );

  if (confirmation === true) {
    await message.author.send('Your final recording has been saved.');
    saveGameData(); // Save the recording

    // Check if all players now have recordings (since we are in step 8)
    // Use 'recordings' field for check
    const allPlayersHaveRecordings = game.playerOrder.every(pId => game.players[pId]?.recordings && game.players[pId].recordings.trim() !== '');
    if (allPlayersHaveRecordings) {
      const gameChannel = client.channels.cache.get(game.textChannelId);
      if (gameChannel) {
        // If we were waiting in step 8, advance
        clearReminderTimers(game);
        game.characterGenStep++;
        saveGameData();
        await sendCharacterGenStep(gameChannel, game); // Move to step 9
      } else {
        console.error(`Cannot proceed after final recording: Game channel ${game.textChannelId} not found.`);
        // Notify GM...
        const gmUser = await client.users.fetch(game.gmId).catch(console.error);
        if (gmUser) {
          await gmUser.send(`Error: All final recordings received for Step 8, but the game channel <#${game.textChannelId}> could not be found. Cannot advance step automatically.`).catch(console.error);
        }
      }
    }
  } else if (confirmation === false) {
    player.recordings = ''; // Clear the recording if they said no
    saveGameData();
    await message.author.send('Okay, your previous recording attempt has been discarded. Please send your final recording again when ready (during Step 8).');
  } else { // Timeout or error
    player.recordings = ''; // Clear on timeout as well
    saveGameData();
    console.log(`Recording confirmation timed out or failed for user ${userId}. Recording discarded.`);
    // requestConsent already sends a timeout message
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
    for (let i = 0; i < game.playerOrder.length; i++) {
      const playerId = game.playerOrder[i];
      const player = game.players[playerId];
      const isLastPlayer = (i === game.playerOrder.length - 1); // Check if this is the last player

      // Fetch user for display name (handle potential errors)
      let user;
      try { user = await client.users.fetch(playerId); }
      catch (fetchError) { console.warn(`playRecordings: Could not fetch user ${playerId}. Using stored username.`); }
      const playerName = player?.name || player?.playerUsername || (user ? user.username : `Player ${playerId}`);

      // *** MODIFIED CHECK FOR MISSING RECORDING ***
      if (!player || !player.recordings || player.recordings.trim() === '') {
        console.log(`playRecordings: Skipping player ${playerId} - no data or recording found.`);
        // Announce the skip in the channel
        let skipMessage = `*(No final message found for ${playerName}.)*`;
        // Add follow-up text if not the last player
        if (!isLastPlayer) {
          skipMessage += ` Playing the next recording after a short pause.`;
        }
        await channel.send(skipMessage);
        await new Promise(resolve => setTimeout(resolve, 3000)); // Pause after skip message
        continue; // Skip this player
      }

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

function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]]; // Swap elements
  }
  return array; // Return the shuffled array (though it's shuffled in place)
}

async function setupTestGame(message, args, isGameplayTest) {
  const expectedArgCount = isGameplayTest ? 4 : 3; // scene + channel + gm + player1 = 4 for gameplay
  if (args.length < expectedArgCount) {
    const usage = isGameplayTest
      ? `Usage: ${BOT_PREFIX}testGameplay <Scene (1-10)> <Game Channel ID> <GM ID> <Player1 ID> [<Player2 ID> ...]`
      : `Usage: ${BOT_PREFIX}testCharGenStep <Step (1-9)> <Game Channel ID> <GM ID> <Player1 ID> [<Player2 ID> ...]`
    return { error: usage };
  }

  let sceneOrStep = null;
  if (isGameplayTest) {
    sceneOrStep = parseInt(args.shift());
    if (isNaN(sceneOrStep) || sceneOrStep < 1 || sceneOrStep > 10) {
      return { error: `Invalid Scene Number: ${sceneOrStep}. Please use a number between 1 and 10.` };
    }
  } else {
    sceneOrStep = parseInt(args.shift()); // For char gen test
    if (isNaN(sceneOrStep) || sceneOrStep < 1 || sceneOrStep > 9) {
      return { error: `Invalid Step Number: ${sceneOrStep}. Please use a number between 1 and 9.` };
    }
  }

  const gameChannelId = args.shift();
  const gmId = args.shift();
  const playerIds = args;

  // --- Validate IDs ---
  if (!/^\d+$/.test(gameChannelId)) {
    return { error: `Invalid Game Channel ID: ${gameChannelId}. Please use a numeric channel ID.` };
  }
  if (!/^\d+$/.test(gmId)) {
    return { error: `Invalid GM ID: ${gmId}. Please use a numeric user ID.` };
  }
  for (const playerId of playerIds) {
    if (!/^\d+$/.test(playerId)) {
      return { error: `Invalid Player ID: ${playerId}. Please use a numeric user ID.` };
    }
  }
  if (playerIds.length < 1 || playerIds.length > 9) {
    return { error: 'Invalid number of players. Please provide between 1 and 9 player IDs.' };
  }
  if (playerIds.includes(gmId)) {
    return { error: 'The GM cannot also be a player.' };
  }

  // --- Fetch Discord Objects ---
  let gameChannel;
  try {
    gameChannel = await client.channels.fetch(gameChannelId);
    if (!gameChannel) throw new Error('Channel not found in cache or API.');
  } catch (error) {
    console.error(`setupTestGame: Error fetching game channel ${gameChannelId}:`, error);
    return { error: `Could not find or fetch game channel with ID ${gameChannelId}.` };
  }

  const guild = gameChannel.guild;
  if (!guild) {
    return { error: `Could not find guild for channel ${gameChannelId}.` };
  }

  let gmMember;
  try {
    gmMember = await guild.members.fetch(gmId);
  } catch (error) {
    console.error(`setupTestGame: Error fetching GM member ${gmId}:`, error);
    return { error: `Could not fetch GM member with ID ${gmId}.` };
  }

  const fetchedPlayers = [];
  const missingPlayerIds = [];
  await Promise.all(playerIds.map(async (playerId) => {
    try {
      const member = await guild.members.fetch(playerId);
      fetchedPlayers.push(member);
    } catch (error) {
      console.error(`setupTestGame: Error fetching player member ${playerId}:`, error);
      missingPlayerIds.push(playerId);
    }
  }));

  if (missingPlayerIds.length > 0) {
    return { error: `Could not fetch the following player members: ${missingPlayerIds.join(', ')}.` };
  }

  // --- Create Base Game Object ---
  const gameMode = gameChannel.type === ChannelType.GuildVoice ? 'voice-plus-text' : 'text-only';
  const game = {
    gm: { consent: true, brink: '', givenBrink: '' }, // Will be populated later
    players: {},
    playerOrder: playerIds, // Use the validated list
    characterGenStep: isGameplayTest ? 9 : sceneOrStep, // Set appropriately
    scene: isGameplayTest ? sceneOrStep : 1, // Set scene for gameplay test
    dicePool: isGameplayTest ? Math.max(0, 11 - sceneOrStep) : 10, // Calculate dice pool for gameplay
    diceLost: 0,
    inLastStand: isGameplayTest ? (sceneOrStep === 11) : false, // Scene 11 is theoretical Last Stand start
    traitsRequested: true, // Assume true for testing
    theme: 'Test Theme',
    textChannelId: gameChannelId,
    guildId: guild.id,
    voiceChannelId: gameChannel.type === ChannelType.GuildVoice ? gameChannelId : null,
    gameMode: gameMode,
    initiatorId: message.author.id,
    gmId: gmId,
    // Add other necessary base fields from schema if missing
    endGame: false,
    playingRecordings: false,
  };

  return { game, gameChannel, gmMember, fetchedPlayers, scene: isGameplayTest ? sceneOrStep : null, error: null };
}

async function testCharGenStep(message, args) {
  const setupResult = await setupTestGame(message, args, false);

  if (setupResult.error) {
    await message.channel.send(setupResult.error);
    return;
  }

  const { game, gameChannel, gmMember, fetchedPlayers, error } = setupResult;
  const step = game.characterGenStep; // Get step from the game object set by helper

  // --- Populate GM Data ---
  game.gm.brink = getRandomBrink(true); // Keep raw for char gen
  game.gm.givenBrink = `You saw *them* ${getRandomBrink(true)}.`; // Keep raw for char gen

  // --- Populate Player Data ---
  for (const playerMember of fetchedPlayers) {
    const playerId = playerMember.id;
    const playerName = getRandomName();

    // Determine stack order based on the step being tested
    let stackOrderForTest = [];
    let initialChoiceForTest = null;
    let availableTraitsForTest = ['Virtue', 'Vice', 'Moment']; // Default for early steps

    if (step > 6) { // If testing step 7, 8, or 9, the stack should be formed
      const traitsToShuffle = ['Virtue', 'Vice', 'Moment'];
      const shuffledTraits = shuffleArray([...traitsToShuffle]);
      stackOrderForTest = [...shuffledTraits, 'Brink'];
      initialChoiceForTest = stackOrderForTest[0]; // Set based on randomized top
      availableTraitsForTest = []; // No traits available after stack is formed
      console.log(`testCharGenStep (Step ${step}): Generated stack for ${playerName} (${playerId}): ${stackOrderForTest.join(', ')}`);
    } else {
      // For steps 1-6, the stack is empty or in progress
      console.log(`testCharGenStep (Step ${step}): Stack order empty for ${playerName} (${playerId})`);
    }


    game.players[playerId] = {
      playerUsername: playerMember.user.username,
      consent: true,
      brink: getRandomBrink(), // Keep raw for char gen
      givenBrink: `You saw ${getRandomName()} ${getRandomBrink()}.`, // Keep raw for char gen
      moment: getRandomMoment(),
      virtue: getRandomVirtue(),
      vice: getRandomVice(),
      name: playerName,
      look: getRandomLook(),
      concept: getRandomConcept(),
      recordings: step > 7 ? 'Final recording text.' : '', // Add placeholder if testing step 8+
      hopeDice: 0,
      virtueBurned: false,
      viceBurned: false,
      momentBurned: false,
      isDead: false,
      // *** Use the determined stack order and available traits ***
      availableTraits: availableTraitsForTest,
      stackOrder: stackOrderForTest,
      initialChoice: initialChoiceForTest,
      gear: step > 7 ? ['House Keys', 'Cell Phone', 'Hair Clip'] : [], // Add gear if testing step 8+
      inventoryConfirmed: step > 7, // Assume confirmed if testing step 8+
      language: null,
      voice: null,
      brinkUsedThisRoll: false, // Initialize this field
    };
  }

  // --- Save and Start ---
  gameData[game.textChannelId] = game;
  saveGameData(); // Ensure validation schema includes brinkUsedThisRoll

  await message.channel.send(`Starting character generation test at step ${step} in <#${game.textChannelId}> with GM <@${game.gmId}> and players ${game.playerOrder.map(id => `<@${id}>`).join(', ')}.`);

  // Send the appropriate character generation step message/logic
  await sendCharacterGenStep(gameChannel, game);
}

async function testGameplay(message, args) {
  const setupResult = await setupTestGame(message, args, true);

  if (setupResult.error) {
    await message.channel.send(setupResult.error);
    return;
  }

  const { game, gameChannel, gmMember, fetchedPlayers, scene, error } = setupResult;

  // --- Populate GM Data ---
  game.gm.brink = normalizeBrink(getRandomBrink(true), "Someone", true); // Normalized Threat Brink
  game.gm.givenBrink = `You saw *them* ${getRandomBrink(true)}.`; // Example formatted givenBrink

  // --- Populate Player Data (Gameplay Ready) ---
  for (const playerMember of fetchedPlayers) {
    const playerId = playerMember.id;
    const playerName = getRandomName();
    const traitsToShuffle = ['Virtue', 'Vice', 'Moment'];
    // Shuffle the traits and add Brink at the end
    const finalStackOrder = [...shuffleArray([...traitsToShuffle]), 'Brink']; // Use spread to shuffle a copy

    game.players[playerId] = {
      playerUsername: playerMember.user.username,
      consent: true,
      brink: normalizeBrink(getRandomBrink(), playerName, false),
      givenBrink: `You saw ${getRandomName()} ${getRandomBrink()}.`,
      moment: getRandomMoment(),
      virtue: getRandomVirtue(),
      vice: getRandomVice(),
      name: playerName,
      look: getRandomLook(),
      concept: getRandomConcept(),
      recordings: 'Placeholder final recording text.',
      hopeDice: 0,
      virtueBurned: false,
      viceBurned: false,
      momentBurned: false,
      isDead: false,
      availableTraits: [], // No available traits left to choose in gameplay
      // *** Use the randomized stack order ***
      stackOrder: finalStackOrder,
      initialChoice: finalStackOrder[0], // Set initial choice based on the randomized top
      gear: ['Flashlight', 'Map Fragment', 'Half-eaten candy bar'],
      inventoryConfirmed: true,
      language: 'en-US',
      voice: 'en-US-Standard-B',
      brinkUsedThisRoll: false, // Initialize this field
    };
    // Log the generated stack for verification during testing
    console.log(`testGameplay: Generated stack for ${playerName} (${playerId}): ${finalStackOrder.join(', ')}`);
  }

  // --- Save and Announce ---
  gameData[game.textChannelId] = game;
  saveGameData(); // Ensure validation schema includes brinkUsedThisRoll

  const statusMessage = game.inLastStand
    ? `Starting gameplay test in **The Last Stand** (Scene ${scene})`
    : `Starting gameplay test in **Scene ${scene}** (Dice Pool: ${game.dicePool})`;

  await message.channel.send(`${statusMessage} in <#${game.textChannelId}> with GM <@${game.gmId}> and players ${game.playerOrder.map(id => `<@${id}>`).join(', ')}.`);

  // Announce the current scene status in the game channel
  await gameChannel.send(`**--- Test Start: Scene ${scene} ---**`);
  if (game.inLastStand) {
    await gameChannel.send(`The last candle is extinguished. The darkness closes in.\n\n**WE ARE IN THE LAST STAND.**`);
  } else {
    await sendCandleStatus(gameChannel, game.dicePool);
    await gameChannel.send(`Dice Pool Remaining: ${game.dicePool}. GM Dice: ${Math.max(0, game.scene - 1)}.`);
  }
  await gameChannel.send(`GM (<@${game.gmId}>), please narrate the scene. Players, be on the lookout for any actions you can take to drive the story forward (using \`${BOT_PREFIX}conflict\`).`);
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