import { validateGameSetup, gameDataSchema } from '../validation.js';
import { sendCharacterGenStep } from '../chargen.js';
import { saveGameData, requestConsent, sendDM, sendConsentConfirmation } from '../utils.js';
import { client } from '../index.js';
import { ChannelType } from 'discord.js';
import { CONSENT_TIMEOUT } from '../config.js';
import { setGameData } from '../utils.js';

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

    if (!gameData[channelId]) {
        gameData[channelId] = {};
    }
    setGameData(channelId, gameData[channelId]);

    const validationResult = validateGameSetup(message);

    if (!validationResult.valid) {
        try {
            await message.author.send({ content: validationResult.reason });
            await message.delete();
        } catch (error) {
            console.error(`Failed to delete message in <#${channelId}>: ${error.message}`);
        }
        return;
    }

    const gmId = validationResult.gmId;
    const playerIds = validationResult.playerIds;

    const guild = message.guild;
    await guild.members.fetch();

    if (!client.users.cache.get(gmId)) {
        console.error(`startGame: Invalid GM ID: ${gmId}`);
        await message.author.send({ content: `Invalid GM ID: <@${gmId}>. Game cancelled.` });
        return;
    }

    for (const playerId of playerIds) {
        const player = message.guild.members.cache.get(playerId);
        if (!player) {
            try {
                await message.author.send({ content: `Roles cannot be players. Game cancelled.` });
                await message.delete();
            } catch (error) {
                console.error(`Failed to delete message in <#${channelId}>: ${error.message}`);
            }
            delete gameData[channelId];
            saveGameData();
            return;
        }
        if (player.user.bot) {
            try {
                await message.author.send({ content: `Bots cannot be players. Game cancelled.` });
                await message.delete();
            } catch (error) {
                console.error(`Failed to delete message in <#${channelId}>: ${error.message}`);
            }
            delete gameData[channelId];
            saveGameData();
            return;
        }
    }

    console.log(`startGame: Creating gameData object for channel ${channelId}`);

    if (!gameData[channelId]) {
        gameData[channelId] = {};
    }

    gameData[channelId].gm = {
        consent: null,
        brink: ""
    };
    gameData[channelId].players = {};
    gameData[channelId].players[gmId] = {
      playerUsername: client.users.cache.get(gmId).username,
      consent: null,
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
      isDead: false
    };
    gameData[channelId].players[gmId].consent = false;
    gameData[channelId].gm.consent = false;
    for (const playerId of playerIds) {
        gameData[channelId].players[playerId] = {
            playerUsername: client.users.cache.get(playerId).username,
            consent: null,
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
            isDead: false
        };
    }
    
    gameData[channelId].playerOrder = playerIds;
    gameData[channelId].characterGenStep = 1;
    gameData[channelId].traitsRequested = false;
    gameData[channelId].theme = "";
    gameData[channelId].textChannelId = channelId;
    gameData[channelId].guildId = guildId;
    gameData[channelId].voiceChannelId = voiceChannelId;
    gameData[channelId].gameMode = gameMode;
    gameData[channelId].initiatorId = initiatorId;
    gameData[channelId].gmId = gmId;
    gameData[channelId].channelId = channelId;
    gameData[channelId].diceLost = 0;

    console.log(`startGame: gameData object created:`, gameData[channelId]);
    console.log(`startGame: Calling saveGameData()`);
    saveGameData();

    // GM Consent Prompt
    const gmConsentPromise = new Promise(async (resolve) => {
        try {
            const gm = message.guild.members.cache.get(gmId);
            const playerMentions = playerIds.map(id => `<@${id}>`).join(', ');
            const gmNotification = `You have been designated as the GM for a new Ten Candles game by <@${initiatorId}>. \n\nOther players in the game are: ${playerMentions}`;
            await sendDM(gm.user, gmNotification);

            const gmConsented = await requestConsent(
                gm.user,
                `You have been designated as the GM role for a **Ten Candles** game in ${message.guild.name}. Do you consent to participate?`,
                'gm_consent_yes',
                'gm_consent_no',
                CONSENT_TIMEOUT,
                "Request for Consent"
            );
            gameData[channelId].gm.consent = gmConsented;
            if (gmConsented) {
                await sendConsentConfirmation(gm.user, gameData[channelId], 'gm', message.guild.name, message.channel.name, guildId, channelId);
            }
            resolve({ id: gmId, consent: gmConsented, type: "gm" });
        } catch (error) {
            console.error('Error requesting GM consent:', error);
            try {
                await message.author.send({ content: 'GM consent failed. Please check the console for details. Game cancelled.' });
                await message.delete();
            } catch (error) {
                console.error(`Failed to delete message in <#${channelId}>: ${error.message}`);
            }
            delete gameData[channelId];
            saveGameData();
            resolve({ id: gmId, consent: false, type: "gm" });
        }
    });

    // Player Consent Prompts
    const playerConsentPromises = playerIds.map(async (playerId) => {
        return new Promise(async (resolve) => {
            try {
                const player = await message.guild.members.fetch(playerId);
                const playerConsented = await requestConsent(
                    player.user,
                    `You have been added as a player to a **Ten Candles** game in ${message.guild.name}. Do you consent to participate?`,
                    'player_consent_yes',
                    'player_consent_no',
                    CONSENT_TIMEOUT,
                    "Request for Consent"
                );
                gameData[channelId].players[playerId].consent = playerConsented;
                if (playerConsented) {
                    await sendConsentConfirmation(player.user, gameData[channelId], 'player', message.guild.name, message.channel.name, guildId, channelId);
                }
                resolve({ id: playerId, consent: playerConsented, type: "player" });
            } catch (error) {
                console.error(`Error requesting player ${playerId} consent:`, error);
                try {
                    await message.author.send({ content: `Player <@${playerId}> consent failed. Please check the console for details. Game cancelled.` });
                    await message.delete();
                } catch (error) {
                    console.error(`Failed to delete message in <#${channelId}>: ${error.message}`);
                }
                delete gameData[channelId];
                saveGameData();
                resolve({ id: playerId, consent: false, type: "player" });
            }
        });
    });

    try {
        await Promise.race([
            gmConsentPromise,
            ...playerConsentPromises
        ]);
    } catch (error) {
        console.error("Error during consent checks:", error);
    }

    const consentResults = await Promise.all([gmConsentPromise, ...playerConsentPromises]);

    for (const result of consentResults) {
        if (result.type === "gm") {
            gameData[channelId].gm.consent = result.consent;
        } else if (result.type === "player") {
            gameData[channelId].players[result.id].consent = result.consent;
        }
    }

    let gmConsented = true;
    let playerConsented = true;

    for (const result of consentResults) {
        if (result.type === "gm") {
            if (result.consent === false || result.consent === undefined) {
                gmConsented = false;
            }
        } else if (result.type === "player") {
            if (result.consent === false || result.consent === undefined) {
                playerConsented = false;
            }
        }
    }

    if (!gmConsented || !playerConsented) {
        try {
            await message.author.send({ content: `One or more players and/or the GM's consent check failed. Game cancelled.` });
            await message.delete();
        } catch (error) {
            console.error(`Failed to delete message in <#${channelId}>: ${error.message}`);
        }
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

    await message.channel.send(confirmationMessage);
    await new Promise(resolve => setTimeout(resolve, 5000));

    const gameChannel = message.guild.channels.cache.get(channelId);
    const game = gameData[channelId];
    sendCharacterGenStep(gameChannel, game);
    saveGameData();
}
