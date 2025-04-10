import { getGameData, saveGameData, sendDM, markPlayerDead, areOtherPlayersAlive, findGameByUserId } from '../utils.js'; // Added markPlayerDead, areOtherPlayersAlive, findGameByUserId
import { playRecordings, client } from '../index.js'; // Added client
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { BOT_PREFIX, MARTYRDOM_TIMEOUT } from '../config.js'; // Added BOT_PREFIX, MARTYRDOM_TIMEOUT

export async function died(message, args) {
    const channelId = message.channel.id;
    const game = getGameData(channelId);
    const gmUser = message.author; // The user who issued the command (should be GM)

    if (!game) {
        message.channel.send('No game in progress in this channel.');
        return;
    }

    if (game.characterGenStep < 9) {
        message.channel.send("This command can only be used after character generation is complete (this isn't **Traveller**).");
        return;
    }

    if (game.gmId !== gmUser.id) {
        try {
            await sendDM(gmUser, 'Only the GM can use this command.'); // Use sendDM for better error handling
            await message.delete();
        } catch (error) {
            // Ignore deletion errors if message already gone
            if (error.code !== 10008) {
                console.error(`died: Failed to delete non-GM message in <#${channelId}>: ${error.message}`);
            }
        }
        return;
    }

    if (args.length < 1) {
        message.reply(`Usage: \`${BOT_PREFIX}died <@Player> [Cause of Death]\``);
        return;
    }

    // Use mentions to get the ID robustly
    const mentionedUser = message.mentions.users.first();
    if (!mentionedUser) {
        message.reply('Invalid Player mention. Please mention a valid player in this game using `@Username`.');
        return;
    }
    const playerIdToKill = mentionedUser.id;

    if (!game.players[playerIdToKill]) {
        message.reply(`<@${playerIdToKill}> is not a player in this game.`);
        return;
    }

    const playerToKillData = game.players[playerIdToKill];

    if (playerToKillData.isDead) {
        message.reply(`<@${playerIdToKill}> is already marked as dead.`);
        return;
    }

    const reason = args.slice(1).join(' ').trim() || 'Unknown causes'; // Default reason if none provided
    const characterName = playerToKillData.name || playerToKillData.playerUsername;

    // --- Martyrdom Check ---
    const canBeMartyr = playerToKillData.hopeDice > 0 && areOtherPlayersAlive(game, playerIdToKill);

    if (canBeMartyr) {
        console.log(`died: Player ${playerIdToKill} has ${playerToKillData.hopeDice} hope dice and other players are alive. Asking GM about martyrdom.`);

        // Clear any previous pending martyrdom state for this game, just in case
        if (game.pendingMartyrdom) {
            console.warn(`died: Clearing previous pending martyrdom state for game ${channelId}`);
            if (game.pendingMartyrdom.gmTimeoutId) clearTimeout(game.pendingMartyrdom.gmTimeoutId);
            if (game.pendingMartyrdom.playerTimeoutId) clearTimeout(game.pendingMartyrdom.playerTimeoutId);
            delete game.pendingMartyrdom;
        }

        const martyrEmbed = new EmbedBuilder()
            .setColor(0xFFA500) // Orange color for question
            .setTitle('Martyrdom Opportunity')
            .setDescription(`**${characterName}** (<@${playerIdToKill}>) has died with ${playerToKillData.hopeDice} Hope ${playerToKillData.hopeDice === 1 ? 'Die' : 'Dice'} remaining.\n\nWas their death a martyrdom, allowing them to pass on **one** Hope Die to another living player?`)
            .addFields({ name: 'Cause of Death', value: reason })
            .setFooter({ text: `Game in #${message.channel.name}. You have ${formatDuration(MARTYRDOM_TIMEOUT)} to respond.` }); // Use formatDuration

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`martyr_confirm_yes_${playerIdToKill}_${channelId}`) // Include player ID and channel ID
                    .setLabel('Yes, it was Martyrdom')
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId(`martyr_confirm_no_${playerIdToKill}_${channelId}`) // Include player ID and channel ID
                    .setLabel('No, just death')
                    .setStyle(ButtonStyle.Danger)
            );

        try {
            // Send DM to the GM who issued the command
            const dmMessage = await sendDM(gmUser, { embeds: [martyrEmbed], components: [row] });

            if (!dmMessage) {
                throw new Error("Failed to send DM to GM."); // Trigger catch block if sendDM failed
            }

            await message.reply({ content: `Player <@${playerIdToKill}> has hope dice remaining and other players are alive. Check your DMs to confirm if their death was a martyrdom.`, allowedMentions: { repliedUser: false } });

            // Store the pending state
            game.pendingMartyrdom = {
                dyingPlayerId: playerIdToKill,
                reason: reason,
                gmMessageId: dmMessage.id, // Store message ID to disable buttons later
                gmTimeoutId: null, // Placeholder for timeout ID
                playerTimeoutId: null // Placeholder for player timeout ID
            };

            // Set a timeout for the GM's response
            game.pendingMartyrdom.gmTimeoutId = setTimeout(async () => {
                const currentGame = getGameData(channelId); // Re-fetch game data
                // Check if the *specific* pending martyrdom is still active
                if (currentGame && currentGame.pendingMartyrdom && currentGame.pendingMartyrdom.dyingPlayerId === playerIdToKill && currentGame.pendingMartyrdom.gmMessageId === dmMessage.id) {
                    console.log(`died: Martyrdom confirmation for ${playerIdToKill} (Game ${channelId}) timed out.`);

                    // Disable buttons on the original DM
                    try {
                        const originalDm = await gmUser.dmChannel.messages.fetch(dmMessage.id);
                        const disabledRow = new ActionRowBuilder().addComponents(
                            row.components.map(button => ButtonBuilder.from(button).setDisabled(true))
                        );
                        await originalDm.edit({ content: '*This request timed out.*', components: [disabledRow] });
                    } catch (editError) {
                        // Ignore if message deleted or interaction already handled
                        if (editError.code !== 10008 && editError.code !== 10062) {
                            console.error("died: Error disabling buttons on GM timeout:", editError);
                        }
                    }

                    // Clean up pending state *before* calling markPlayerDead
                    const timeoutReason = currentGame.pendingMartyrdom.reason; // Get reason before deleting
                    delete currentGame.pendingMartyrdom;
                    saveGameData(); // Save the cleanup

                    // Mark dead and announce (use the fetched channel object)
                    const gameChannel = client.channels.cache.get(channelId);
                    if (gameChannel) {
                        await gameChannel.send(`Martyrdom confirmation for ${characterName} timed out. Proceeding as normal death.`);
                        markPlayerDead(currentGame, playerIdToKill, timeoutReason, gameChannel); // Use helper
                    } else {
                        console.error(`died (GM Timeout): Could not find game channel ${channelId} for final death announcement.`);
                        // GM should already know via timeout message, but log it.
                    }
                } else {
                     console.log(`died: GM Timeout for ${playerIdToKill} (Game ${channelId}) triggered, but pendingMartyrdom state was already cleared or changed.`);
                }
            }, MARTYRDOM_TIMEOUT); // Use the specific timeout

            saveGameData(); // Save the pending state with the timeout ID

        } catch (dmError) {
            console.error(`died: Failed to send martyrdom confirmation DM to GM ${gmUser.tag} for game ${channelId}:`, dmError);
            await message.channel.send(`Could not DM the GM (<@${gmUser.id}>) to confirm martyrdom. Proceeding as a normal death.`);
            // Proceed with normal death if DM fails
            markPlayerDead(game, playerIdToKill, reason, message.channel); // Use helper function
        }

    } else {
        // --- Original Logic (No Hope Dice, No other players alive, or Already Dead) ---
        console.log(`died: Player ${playerIdToKill} cannot be a martyr (Hope: ${playerToKillData.hopeDice}, Others Alive: ${areOtherPlayersAlive(game, playerIdToKill)}). Proceeding with normal death.`);
        markPlayerDead(game, playerIdToKill, reason, message.channel); // Use helper function
    }
}
