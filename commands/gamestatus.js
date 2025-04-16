// commands/gamestatus.js
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType } from 'discord.js';
import { gameData, findGameByUserId } from '../utils.js'; // Import findGameByUserId
import { client } from '../index.js'; // Import client if needed for channel name fetching

// Keep the original function for channel commands
export async function gameStatus(messageOrChannel) {
    let channelId, gameChannelName, targetChannel;

    if (messageOrChannel.channel) { // If it's a message object
        targetChannel = messageOrChannel.channel;
        channelId = targetChannel.id;
        gameChannelName = targetChannel.name;
    } else { // If it's a channel object
        targetChannel = messageOrChannel;
        channelId = targetChannel.id;
        gameChannelName = targetChannel.name;
    }

    const game = gameData[channelId];

    if (!game) {
        await targetChannel.send(`There is no game in progress in #${gameChannelName}.`).catch(console.error);
        return;
    }

    const embed = generateGameStatusEmbed(game, gameChannelName); // Use helper
    await targetChannel.send({ embeds: [embed] }).catch(console.error);
}

// --- New Function for GM DM Command ---
export async function gmGameStatus(message) {
    const gmId = message.author.id;

    // 1. Find the game the user is GMing
    // First find *any* game the user is in
    const potentialGame = findGameByUserId(gmId);

    // Check if they are the GM of that game
    if (!potentialGame || potentialGame.gmId !== gmId) {
        await message.author.send('You are not currently the GM of an active game.').catch(console.error);
        return;
    }

    const game = potentialGame; // Found the game they are GMing
    const gameChannelId = game.textChannelId;
    let gameChannelName = `Channel ${gameChannelId}`; // Fallback name

    try {
        const channel = await client.channels.fetch(gameChannelId);
        if (channel) {
            gameChannelName = `#${channel.name}`;
        }
    } catch (error) {
        console.warn(`gmGameStatus: Could not fetch channel name for ${gameChannelId}`);
    }

    // 2. Generate Initial Embed (Game Status)
    const initialEmbed = generateGameStatusEmbed(game, gameChannelName);

    // 3. Generate Buttons
    const components = [];
    const buttons = [];

    // Button for Game Status (always first)
    buttons.push(
        new ButtonBuilder()
            .setCustomId(`gmstatus_game_${gameChannelId}`)
            .setLabel(gameChannelName.substring(0, 80)) // Max 80 chars for label
            .setStyle(ButtonStyle.Primary) // Start with this one active visually (optional)
            .setDisabled(true) // Start disabled as it's the current view
    );

    const ghostsSpeak = game.ghostsSpeakTruths !== false; // Default to true if undefined
    buttons.push(
        new ButtonBuilder()
            .setCustomId(`gmstatus_toggle_ghosts_${gameChannelId}`)
            .setLabel(`Ghosts Speak: ${ghostsSpeak ? 'ON' : 'OFF'}`)
            .setStyle(ghostsSpeak ? ButtonStyle.Success : ButtonStyle.Danger)
        // This button should NOT be disabled
    );

    // Buttons for Players
    for (const playerId of game.playerOrder) {
        const player = game.players[playerId];
        if (player) {
            const playerName = player.name || player.playerUsername;
            buttons.push(
                new ButtonBuilder()
                    .setCustomId(`gmstatus_player_${playerId}_${gameChannelId}`)
                    .setLabel(playerName.substring(0, 80))
                    .setStyle(ButtonStyle.Secondary)
            );
        }
    }

    // Arrange buttons into rows (max 5 per row)
    for (let i = 0; i < buttons.length; i += 5) {
        const row = new ActionRowBuilder().addComponents(buttons.slice(i, i + 5));
        components.push(row);
    }

    // 4. Send DM
    try {
        await message.author.send({ embeds: [initialEmbed], components: components });
    } catch (error) {
        console.error(`gmGameStatus: Failed to send status DM to GM ${gmId}:`, error);
        // Optionally inform the GM in the original channel if DM fails? Risky if channel is public.
    }
}

// --- Helper Function to Generate Game Status Embed ---
export function generateGameStatusEmbed(game, gameChannelName) {
    // --- Prepare data ---
    const themeTitle = game.theme?.title || 'Not set';
    const descriptionValue = game.theme?.description || 'Not set';
    const truncatedDescription = descriptionValue.length > 1024
        ? descriptionValue.substring(0, 1021) + '...'
        : descriptionValue;
    const gameMode = game.gameMode || 'N/A';
    const gmMention = `<@${game.gmId}>`;
    const playerMentions = game.playerOrder.map(pId => `<@${pId}>${game.players[pId]?.isDead ? ' (Dead)' : ''}`).join(', ') || 'None';

    // --- Determine the status line ---
    let statusString = '';
    if (game.characterGenStep < 9) {
        statusString = `Character Generation Step: ${game.characterGenStep}`;
    } else if (game.inLastStand) {
        statusString = "All candles have been extinguished. We are in **The Last Stand**.";
    } else {
        // Combine Gameplay status, scene, and dice pool
        statusString = `Gameplay Active - Current Scene: ${game.scene || 'N/A'} - Dice Pool Remaining: ${game.dicePool !== undefined ? game.dicePool : 'N/A'}`;
    }

    // --- Build the main description string ---
    let descriptionString = `**Theme / Module Title:** ${themeTitle}\n\n`;
    descriptionString += `**Description:** ${truncatedDescription}\n\n`;

    descriptionString += `**Game Mode:** ${gameMode}\n`;
    descriptionString += `**GM:** ${gmMention}\n`;
    descriptionString += `**Players:** ${playerMentions}\n`;
    descriptionString += `**Status:** ${statusString}`;

    // --- Create the Embed ---
    const embed = new EmbedBuilder()
        .setColor(0x0099FF)
        // Keep the title simple
        .setTitle(`Game Status: <#${game.textChannelId}>`)
        // Set the combined description string
        .setDescription(descriptionString)

    return embed;
}

// --- Helper Function to Generate Player Status Embed ---
export function generatePlayerStatusEmbed(game, playerId) {
    const player = game.players[playerId];
    if (!player) {
        return new EmbedBuilder().setColor(0xFF0000).setTitle('Error').setDescription('Player data not found.');
    }

    // --- Prepare Data ---
    const characterName = player.name || player.playerUsername;
    const playerMention = `<@${playerId}>`;
    const statusText = player.isDead ? '**DEAD**' : 'Alive';
    const hopeDice = player.hopeDice || 0;
    const concept = player.concept || 'Not set';
    const look = player.look || 'Not set';
    const virtueText = `${player.virtue || 'N/A'} ${player.virtueBurned ? '(Burned)' : ''}`;
    const viceText = `${player.vice || 'N/A'} ${player.viceBurned ? '(Burned)' : ''}`;
    const momentText = `${player.moment || 'N/A'} ${player.momentBurned ? '(Burned)' : ''}`;
    const brinkText = player.brink || 'N/A';
    const givenBrinkText = player.givenBrink || 'N/A';
    const stackText = player.stackOrder?.join(', ') || 'Not set';
    const inventoryText = player.gear?.length > 0 ? player.gear.join(', ') : 'Empty';
    const recordingText = player.finalRecording || 'Not set';

    // --- Build Description String ---
    // Combine Name, Mention, Status, Hope Dice
    const descriptionString = `**Name: ${characterName}** - **Player: ${playerMention}** - **Status: ${statusText}** - **Hope Dice: ${hopeDice}**`;

    // --- Create Embed ---
    const embed = new EmbedBuilder()
        .setColor(player.isDead ? 0x808080 : 0x0099FF) // Grey out if dead
        .setTitle(`Player Status: ${characterName}`) // Keep title for clarity
        .setDescription(descriptionString) // Set the combined top line
        .addFields(
            { name: 'Concept', value: concept, inline: false },
            { name: 'Look', value: look, inline: false },
            { name: 'Virtue', value: virtueText, inline: true },
            { name: 'Vice', value: viceText, inline: true },
            { name: 'Moment', value: momentText },
            { name: 'Brink', value: brinkText },
            { name: 'Brink Written', value: givenBrinkText },
            { name: 'Stack Order', value: stackText },
            { name: 'Inventory', value: inventoryText },
            { name: 'Final Recording', value: recordingText }
        )
    return embed;
}
