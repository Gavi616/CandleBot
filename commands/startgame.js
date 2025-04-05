import { validateGameSetup, gameDataSchema } from '../validation.js';
import { sendCharacterGenStep } from '../chargen.js';
import { saveGameData, requestConsent, sendDM, sendConsentConfirmation } from '../utils.js';
import { client } from '../index.js';
import { ChannelType } from 'discord.js';
import { CONSENT_TIMEOUT, newGameMessage } from '../config.js';
import { setGameData } from '../utils.js';

export async function startGame(message, gameData) {
    const channelId = message.channel.id;
    const { valid, reason, gmId, playerIds } = validateGameSetup(message);

    if (!valid) {
        message.channel.send(reason);
        return;
    }

    const gameChannel = message.guild.channels.cache.get(channelId);
    if (!gameChannel) {
        console.error(`startGame: Could not find channel with ID ${channelId}`);
        return;
    }

    const gm = await message.guild.members.fetch(gmId);
    const players = await Promise.all(playerIds.map(async (playerId) => {
        return await message.guild.members.fetch(playerId);
    }));

    const game = {
        gm: { consent: false, brink: '' },
        players: {},
        playerOrder: playerIds,
        characterGenStep: 1,
        traitsRequested: false,
        theme: '',
        textChannelId: channelId,
        guildId: message.guild.id,
        voiceChannelId: channelId,
        gameMode: 'voice-plus-text',
        initiatorId: message.author.id,
        gmId: gmId,
        channelId: channelId,
        diceLost: 0,
    };

    for (const player of players) {
        game.players[player.id] = {
            playerUsername: player.user.username,
            consent: null,
            brink: '',
            moment: '',
            virtue: '',
            vice: '',
            name: '',
            look: '',
            concept: '',
            recordings: '',
            hopeDice: 0,
            virtueBurned: false,
            viceBurned: false,
            momentBurned: false,
            isDead: false,
            availableTraits: ['Virtue', 'Vice', 'Moment'],
            stackOrder: [],
            initialChoice: null,
            group: "A",
            stackConfirmed: false,
        };
    }

    console.log(`startGame: Creating gameData object for channel ${channelId}`);
    gameData[channelId] = game;
    console.log(`startGame: gameData object created: ${JSON.stringify(game, null, 2)}`);
    console.log(`startGame: Calling saveGameData()`);
    saveGameData();

    const consentPromises = [];
    const allParticipants = [gm, ...players];

    // Send the game initiation message to all participants
    const gmMention = `<@${gmId}>`;
    const playerMentions = players.map(player => `<@${player.id}>`).join(', ');
    const gameInitiationMessage = `A **Ten Candles** session is being initiated. The GM is ${gmMention}.\nPlayers are: ${playerMentions}.`;
    for (const participant of allParticipants) {
        await sendDM(participant.user, gameInitiationMessage);
    }

    for (const participant of allParticipants) {
        let prompt;
        let yesId;
        let noId;
        let consentType;

        if (participant.id === gmId) {
            prompt = `You have been designated as **the GM** for a **Ten Candles** session in ${message.guild.name}. Do you consent to participate?`;
            yesId = 'gm_consent_yes';
            noId = 'gm_consent_no';
            consentType = 'gm';
        } else {
            prompt = `You have been added as **a player** to a **Ten Candles** session in ${message.guild.name}. Do you consent to participate?`;
            yesId = 'player_consent_yes';
            noId = 'player_consent_no';
            consentType = 'player';
        }

        console.log(`requestConsent: Called for user ${participant.user.tag} with prompt: ${prompt}`);
        consentPromises.push(
            requestConsent(participant.user, prompt, yesId, noId, CONSENT_TIMEOUT, 'Request for Consent')
                .then(async (consented) => {
                    if (consented) {
                        game[consentType].consent = true;
                        if (consentType === 'gm') {
                            game.players[gmId].playerUsername = gm.user.username;
                        } else {
                            game.players[participant.id].consent = true;
                        }
                        await sendConsentConfirmation(participant.user, game, consentType, message.guild.name, message.channel.name, message.guild.id, message.channel.id);
                    } else {
                        game[consentType].consent = false;
                        if (consentType === 'gm') {
                            game.players[gmId].playerUsername = gm.user.username;
                        } else {
                            game.players[participant.id].consent = false;
                        }
                        await sendDM(participant.user, 'You have declined to participate.');
                    }
                })
        );
    }

    await Promise.all(consentPromises);

    const allConsented = Object.values(game.players).every(player => player.consent === true) && game.gm.consent === true;
    if (allConsented) {
        message.channel.send(newGameMessage);
        game.playerOrder = game.playerOrder.filter(playerId => game.players[playerId].consent === true);
        const gameChannel = message.guild.channels.cache.get(channelId);
        const game = gameData[channelId];
        sendCharacterGenStep(gameChannel, game);
        saveGameData();
    } else {
        message.channel.send('One or more of the players and/or GM did not consent. Cancelling game.');
        delete gameData[channelId];
        saveGameData();
    }
}