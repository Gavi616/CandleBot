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

    // Now check if they are the GM of that game
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
    const embed = new EmbedBuilder()
        .setColor(0x0099FF)
        .setTitle(`Game Status: ${gameChannelName}`)
        .addFields(
            { name: 'Theme / Module', value: game.theme || 'Not set' },
            { name: 'Game Mode', value: game.gameMode || 'N/A' },
            { name: 'GM', value: `<@${game.gmId}>` },
            { name: 'Players', value: game.playerOrder.map(pId => `<@${pId}>${game.players[pId]?.isDead ? ' (Dead)' : ''}`).join(', ') || 'None' }
        )
        .setTimestamp();

    if (game.characterGenStep < 9) {
        embed.addFields({ name: 'Status', value: `Character Generation Step: ${game.characterGenStep}` });
    } else if (game.inLastStand) {
        embed.addFields({ name: 'Status', value: "All candles have been extinguished. We are in **The Last Stand**." });
    } else {
        embed.addFields(
            { name: 'Status', value: `Gameplay Active` },
            { name: 'Current Scene', value: `${game.scene || 'N/A'}`, inline: true },
            { name: 'Communal Dice', value: `${game.dicePool !== undefined ? game.dicePool : 'N/A'}`, inline: true }
        );
    }
    return embed;
}

// --- Helper Function to Generate Player Status Embed ---
export function generatePlayerStatusEmbed(game, playerId) {
    const player = game.players[playerId];
    if (!player) {
        return new EmbedBuilder().setColor(0xFF0000).setTitle('Error').setDescription('Player data not found.');
    }

    const playerName = player.name || player.playerUsername;
    const embed = new EmbedBuilder()
        .setColor(player.isDead ? 0x808080 : 0x0099FF) // Grey out if dead
        .setTitle(`Player Status: ${playerName}`)
        .setDescription(player.isDead ? '**DEAD**' : 'Alive')
        .addFields(
            { name: 'Name', value: player.name || 'Not set', inline: true },
            { name: 'Concept', value: player.concept || 'Not set', inline: true },
            { name: 'Look', value: player.look || 'Not set' },
            { name: 'Virtue', value: `${player.virtue || 'N/A'} ${player.virtueBurned ? '(Burned)' : ''}`, inline: true },
            { name: 'Vice', value: `${player.vice || 'N/A'} ${player.viceBurned ? '(Burned)' : ''}`, inline: true },
            { name: 'Moment', value: `${player.moment || 'N/A'} ${player.momentBurned ? '(Burned)' : ''}` },
            { name: 'Brink', value: player.brink || 'N/A' },
            { name: 'Brink Written', value: player.givenBrink || 'N/A' },
            { name: 'Stack Order', value: player.stackOrder?.join(', ') || 'Not set' },
            { name: 'Hope Dice', value: `${player.hopeDice || 0}`, inline: true },
            { name: 'Inventory', value: player.gear?.length > 0 ? player.gear.join(', ') : 'Empty' },
            { name: 'Final Recording', value: player.recordings || 'Not set' }
        )
        .setFooter({ text: `Player ID: <@${playerId}>` })
        .setTimestamp();

    return embed;
}