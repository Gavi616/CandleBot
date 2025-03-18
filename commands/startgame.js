import { validateGameSetup } from '../validation.js';
import { sendCharacterGenStep } from '../chargen.js';
import { saveGameData } from '../utils.js';
import { client } from '../index.js';
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType } from 'discord.js';
import { CONSENT_TIMEOUT } from '../config.js';

export async function startGame(message, gameData) {
    const channelId = message.channel.id;
    const initiatorId = message.author.id;
    const guildId = message.guild.id;
    let voiceChannelId = null;
    let gameMode = null;

    if (message.channel.type === ChannelType.GuildVoice) {
        gameMode = "voice-plus-text";
        voiceChannelId = channelId;
    } else {
        gameMode = "text-only";
    }

    const validationResult = await validateGameSetup(message);

    if (!validationResult.valid) {
        message.reply(validationResult.reason);
        return;
    }

    const gmId = validationResult.gmId;
    const playerIds = validationResult.playerIds;

    // Check for bots and role mentions
    for (const playerId of playerIds) {
        const player = message.guild.members.cache.get(playerId);
        if (!player) {
            message.channel.send(`Roles cannot be players. Game cancelled.`);
            delete gameData[channelId];
            saveGameData();
            return;
        }
        if (player.user.bot) {
            message.channel.send(`Bots cannot be players. Game cancelled.`);
            delete gameData[channelId];
            saveGameData();
            return;
        }
    }

    gameData[channelId] = {
        gmId: gmId,
        players: {},
        playerOrder: playerIds,
        characterGenStep: 1,
        traitsRequested: false,
        textChannelId: channelId,
        guildId: guildId,
        voiceChannelId: voiceChannelId,
        gameMode: gameMode,
        gm: {
            consent: null, // Initialize consent to null
            brink: ""
        },
    };

    for (const playerId of playerIds) {
        gameData[channelId].players[playerId] = {
            playerUsername: client.users.cache.get(playerId).username,
            consent: null, // Initialize consent to null
            brink: "",
            moment: "",
            virtue: "",
            vice: "",
            name: "",
            look: "",
            concept: "",
            recordings: "",
            hopeDice: 0,
            virtueBurned: false,
            viceBurned: false,
            momentBurned: false,
            isDead: false,
        };
    }
    saveGameData();

    // GM Consent Prompt
    const gmConsentPromise = new Promise(async (resolve) => {
        try {
            const gm = message.guild.members.cache.get(gmId);
            const dmChannel = await gm.user.createDM();

            const playerMentions = playerIds.map(id => `<@${id}>`).join(', ');
            const gmNotification = `You have been designated as the GM for a new Ten Candles game by <@${initiatorId}>. \n\nOther players in the game are: ${playerMentions}`;
            await gm.user.send(gmNotification);

            const consentEmbed = new EmbedBuilder()
                .setColor(0x0099FF)
                .setTitle('GM Consent Required')
                .setDescription(
                    `You have been designated as the GM role for a **Ten Candles** game in #${message.guild.name}. Do you consent to participate?`
                );

            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('gm_consent_yes')
                        .setLabel('Yes')
                        .setStyle(ButtonStyle.Success),
                    new ButtonBuilder()
                        .setCustomId('gm_consent_no')
                        .setLabel('No')
                        .setStyle(ButtonStyle.Danger)
                );

            const consentMessage = await gm.user.send({
                embeds: [consentEmbed],
                components: [row],
            });

            let startupMessageText = 'A new **Ten Candles** game is being started in this channel!\n\n';
            if (gameMode === 'voice-plus-text') {
                startupMessageText += `**Voice Channel:** This channel has been set up for audio playback.`;
            } else {
                startupMessageText += '**Text-Only Mode:** Audio playback is not supported in this channel. Final recordings will be text-only.';
            }
            message.channel.send(startupMessageText);

            const gmFilter = (interaction) =>
                interaction.user.id === gmId && interaction.message.id === consentMessage.id;

            const collector = dmChannel.createMessageComponentCollector({
                filter: gmFilter,
                time: CONSENT_TIMEOUT,
            });

            collector.on('collect', async (interaction) => {
                await interaction.deferUpdate();
                if (interaction.customId === 'gm_consent_yes') {
                    gameData[channelId].gm.consent = true;
                    await interaction.editReply({ content: 'You have consented to be the GM.', embeds: [], components: [] });
                } else if (interaction.customId === 'gm_consent_no') {
                    gameData[channelId].gm.consent = false;
                    await interaction.editReply({ content: 'You have declined to be the GM.', embeds: [], components: [] });
                }
                collector.stop();
            });

            collector.on('end', async (collected, reason) => {
                if (reason === 'time') {
                    await consentMessage.edit({
                        content: 'GM consent timed out.',
                        embeds: [],
                        components: [],
                    });
                }
                resolve({ id: gmId, consent: gameData[channelId].gm.consent, type: "gm" }); // Resolve with an object indicating GM consent.
            });
        } catch (error) {
            console.error('Error requesting GM consent:', error);
            message.channel.send(
                'GM consent failed. Please check the console for details. Game cancelled.'
            );
            delete gameData[channelId];
            saveGameData();
            resolve({ id: gmId, consent: false, type: "gm" }); // Resolve with false in case of an error
        }
    });

    // Player Consents Prompts
    const playerConsentPromises = playerIds.map(async (playerId) => {
        return new Promise(async (resolve) => {
            try {
                const player = await message.guild.members.fetch(playerId);
                const user = player.user;
                const dmChannel = await user.createDM();

                const consentEmbed = new EmbedBuilder()
                    .setColor(0x0099FF)
                    .setTitle('Player Consent Required')
                    .setDescription(`You have been added as a player to a **Ten Candles** game in #${message.guild.name}. Do you consent to participate?`);

                const row = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId('player_consent_yes')
                            .setLabel('Yes')
                            .setStyle(ButtonStyle.Success),
                        new ButtonBuilder()
                            .setCustomId('player_consent_no')
                            .setLabel('No')
                            .setStyle(ButtonStyle.Danger)
                    );

                const consentMessage = await user.send({ embeds: [consentEmbed], components: [row] });

                const playerFilter = (interaction) =>
                    interaction.user.id === playerId && interaction.message.id === consentMessage.id;

                const collector = dmChannel.createMessageComponentCollector({
                    filter: playerFilter,
                    time: CONSENT_TIMEOUT,
                });

                collector.on('collect', async (interaction) => {
                    await interaction.deferUpdate();
                    if (interaction.customId === 'player_consent_yes') {
                        gameData[channelId].players[playerId].consent = true;
                        await interaction.editReply({ content: 'You have consented to play.', embeds: [], components: [] });
                    } else if (interaction.customId === 'player_consent_no') {
                        gameData[channelId].players[playerId].consent = false;
                        await interaction.editReply({ content: 'You have declined to play.', embeds: [], components: [] });
                    }
                    collector.stop();
                });

                collector.on('end', async (collected, reason) => {
                    if (reason === 'time') {
                        await consentMessage.edit({ content: 'Consent timed out.', embeds: [], components: [] });
                    }
                    resolve({ id: playerId, consent: gameData[channelId].players[playerId].consent, type: "player" }); // Resolve with an object indicating Player consent.
                });
            } catch (error) {
                console.error(`Error requesting player ${playerId} consent:`, error);
                message.channel.send(`Player <@${playerId}> consent failed. Please check the console for details. Game cancelled.`);
                delete gameData[channelId];
                saveGameData();
                resolve({ id: playerId, consent: false, type: "player" }); // Resolve with false in case of an error
            }
        });
    });

    // Promise.race() to detect any rejection/timeout
    try {
        await Promise.race([
            gmConsentPromise,
            ...playerConsentPromises
        ]);
    } catch (error) {
        console.error("Error during consent checks:", error);
    }

    //Check the results.
    const consentResults = await Promise.all([gmConsentPromise, ...playerConsentPromises]); //Get the array of results.

    const nonConsentPlayers = [];
    let gmConsented = true; //Assume they all consented.
    let playerConsented = true;

    for (const result of consentResults) {
        if (result.type === "gm") { //If the result is from the GM.
            if (result.consent === false || result.consent === undefined) { //If the GM does not consent.
                nonConsentPlayers.push(`<@${result.id}>`); //Add them to the nonConsentPlayers array.
                gmConsented = false; //The GM did not consent.
            }
        } else if (result.type === "player") { //If the result is from a player.
            if (result.consent === false || result.consent === undefined) { //If the player did not consent.
                nonConsentPlayers.push(`<@${result.id}>`); //Add them to the nonConsentPlayers array.
                playerConsented = false; //A player did not consent.
            }
        }
    }

    if (!gmConsented || !playerConsented) { //Check that the GM consented and that all the players consented.
        //If there are non-consenting players, let everyone know.
        const nonConsentList = nonConsentPlayers.join(", ");
        message.channel.send(`One or more players and/or the GM's consent check failed. Game cancelled. ${nonConsentList} did not consent.`);
        //Delete the game.
        delete gameData[channelId];
        saveGameData();
        return;
    }

    let confirmationMessage = '**The World of Ten Candles**\n';
    confirmationMessage += 'Your characters will face unimaginable terrors in the dying of the light.\n\n';
    confirmationMessage += '**Though you know your characters will die, you must have hope that they will survive.**\n\n';
    confirmationMessage += '**Ten Candles** focuses around shared narrative control.\n';
    confirmationMessage += 'Everyone will share the mantle of storyteller and have an equal hand in telling this dark story.\n\n';
    confirmationMessage += 'Let\'s begin character generation. Check your DMs for instructions.\n\n';

    message.channel.send(confirmationMessage)
        .then(() => {
            const gameChannel = message.guild.channels.cache.get(channelId);
            const game = gameData[channelId];
            sendCharacterGenStep(gameChannel, game);
        })
        .catch((error) => {
            console.error('Error sending initial message:', error);
            message.channel.send('Failed to send initial message. Check the console for details. Game cancelled.');
            delete gameData[channelId];
            saveGameData();
        });
}
