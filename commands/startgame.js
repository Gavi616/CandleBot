import { validateGameSetup } from '../validation.js';
import { sendCharacterGenStep } from '../chargen.js';
import { saveGameData, requestConsent, sendDM } from '../utils.js';
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

    console.log(`startGame: Creating gameData object for channel ${channelId}`);
    gameData[channelId] = {
        channelId: channelId, // Add channelId here
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
            consent: null,
            brink: ""
        },
    };

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
            isDead: false,
        };
    }
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
        `You have been designated as the GM role for a **Ten Candles** game in #${message.guild.name}. Do you consent to participate?`,
        'gm_consent_yes',
        'gm_consent_no',
        CONSENT_TIMEOUT,
        "Request for Consent"
    );
      gameData[channelId].gm.consent = gmConsented;
      resolve({ id: gmId, consent: gmConsented, type: "gm" });
  } catch (error) {
      console.error('Error requesting GM consent:', error);
      message.channel.send(
          'GM consent failed. Please check the console for details. Game cancelled.'
      );
      delete gameData[channelId];
      saveGameData();
      resolve({ id: gmId, consent: false, type: "gm" });
  }
});

// Player Consents Prompts
const playerConsentPromises = playerIds.map(async (playerId) => {
  return new Promise(async (resolve) => {
      try {
          const player = await message.guild.members.fetch(playerId);
          const playerConsented = await requestConsent(
            player.user,
            `You have been added as a player to a **Ten Candles** game in #${message.guild.name}. Do you consent to participate?`,
            'player_consent_yes',
            'player_consent_no',
            CONSENT_TIMEOUT,
            "Request for Consent"
        );
          gameData[channelId].players[playerId].consent = playerConsented;
          resolve({ id: playerId, consent: playerConsented, type: "player" });
      } catch (error) {
          console.error(`Error requesting player ${playerId} consent:`, error);
          message.channel.send(`Player <@${playerId}> consent failed. Please check the console for details. Game cancelled.`);
          delete gameData[channelId];
          saveGameData();
          resolve({ id: playerId, consent: false, type: "player" });
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
    console.log(`startGame: Consent results:`, consentResults);

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
