import { validateGameSetup, gameDataSchema } from '../validation.js';
import { saveGameData, requestConsent, sendDM, sendConsentConfirmation, setGameData, getGameData, deleteGameData } from '../utils.js';
import { client, isTesting } from '../index.js';
import { BOT_PREFIX } from '../config.js';
import { getVoiceConnection, joinVoiceChannel } from '@discordjs/voice';
import { ChannelType } from 'discord.js';
import { CONSENT_TIMEOUT, newGameMessage } from '../config.js';

export async function startGame(message, gameData) { // Keep gameData param for potential future use
  const channelId = message.channel.id;
  const { valid, reason, gmId, playerIds } = validateGameSetup(message);

  if (!valid) {
    message.channel.send(reason);
    return;
  }

  // --- Step 1: Fetch Participants ---
  const gameChannel = message.guild.channels.cache.get(channelId);
  if (!gameChannel) {
    console.error(`startGame: Could not find channel with ID ${channelId}`);
    message.channel.send(`Error: Could not find the channel <#${channelId}>.`);
    return;
  }

  let gm;
  let players;
  try {
    gm = await message.guild.members.fetch(gmId);
    players = await Promise.all(playerIds.map(async (playerId) => {
      return await message.guild.members.fetch(playerId);
    }));
  } catch (error) {
    console.error("startGame: Error fetching GM or players:", error);
    message.channel.send("Error fetching participant information. Please ensure all mentioned users are in this server.");
    return;
  }

  const allParticipants = [gm, ...players];

  // --- Step 2: Send Initial Game Info DMs ---
  const gmMention = `<@${gmId}>`;
  const playerMentions = players.map(player => `<@${player.id}>`).join(', ');
  const gameInitiationMessage = `A **Ten Candles** session is being initiated in <#${channelId}> on the server **${message.guild.name}**.\nThe GM is ${gmMention}.\nPlayers are: ${playerMentions}.\n\nYou will receive a direct message asking for your consent to join.`;

  // Send info DMs concurrently
  await Promise.all(allParticipants.map(participant =>
    sendDM(participant.user, gameInitiationMessage).catch(err => {
      console.warn(`startGame: Failed to send initial info DM to ${participant.user.tag}: ${err.message}`);
      // Optionally inform the initiator or channel if DMs fail
      message.channel.send(`⚠️ Could not send game initiation DM to ${participant.user.tag}. Please ensure their DMs are open.`).catch(console.error);
    })
  ));

  // --- Step 3: Request Consent ---
  const consentResults = new Map(); // Store results: userId -> { consented: boolean, type: 'gm' | 'player' }
  const consentPromises = [];

  for (const participant of allParticipants) {
    let prompt;
    let yesId;
    let noId;
    let consentType;

    if (participant.id === gmId) {
      prompt = `You have been designated as **the GM** for the **Ten Candles** session in <#${channelId}>. Do you consent to participate?`;
      yesId = `gm_consent_yes_${channelId}`; // Make IDs unique per game start attempt
      noId = `gm_consent_no_${channelId}`;
      consentType = 'gm';
    } else {
      prompt = `You have been added as **a player** to the **Ten Candles** session in <#${channelId}>. Do you consent to participate?`;
      yesId = `player_consent_yes_${participant.id}_${channelId}`; // Make IDs unique
      noId = `player_consent_no_${participant.id}_${channelId}`;
      consentType = 'player';
    }

    console.log(`startGame: Requesting consent from ${participant.user.tag} (Type: ${consentType})`);
    consentPromises.push(
      requestConsent(participant.user, prompt, yesId, noId, CONSENT_TIMEOUT, 'Request for Consent')
        .then(consented => {
          console.log(`startGame: Consent result for ${participant.user.tag}: ${consented}`);
          consentResults.set(participant.id, { consented, type: consentType });
        })
        .catch(error => {
          console.error(`startGame: Error requesting consent from ${participant.user.tag}:`, error);
          consentResults.set(participant.id, { consented: false, type: consentType }); // Treat error as non-consent
          message.channel.send(`⚠️ An error occurred while requesting consent from ${participant.user.tag}. Assuming they declined.`).catch(console.error);
        })
    );
  }

  // Wait for all consent requests to complete
  await Promise.all(consentPromises);

  // --- Step 4: Check Consent and Proceed or Cancel ---
  const gmConsented = consentResults.get(gmId)?.consented ?? false;
  const allPlayersConsented = playerIds.every(id => consentResults.get(id)?.consented ?? false);
  const allConsented = gmConsented && allPlayersConsented;

  if (!allConsented) {
    // --- Handle Non-Consent first --- Cancel the game and inform participants
    console.log(`startGame: One or more participants did not consent for game in channel ${channelId}. Cancelling.`);
    let declineMessage = 'The **Ten Candles** game initiation in <#' + channelId + '> was cancelled because not all participants consented:\n';
    let anyDeclined = false;

    for (const [userId, result] of consentResults.entries()) {
      if (!result.consented) {
        anyDeclined = true;
        const userTag = allParticipants.find(p => p.id === userId)?.user.tag || `User ID ${userId}`;
        declineMessage += `- ${userTag} declined or did not respond.\n`;
        // Send DM to the person who declined/timed out
        const user = allParticipants.find(p => p.id === userId)?.user;
        if (user) {
          sendDM(user, `You declined or did not respond in time for the **Ten Candles** game in <#${channelId}>. The game has been cancelled.`).catch(console.error);
        }
      }
    }

    if (!anyDeclined) {
      declineMessage = `The **Ten Candles** game initiation in <#${channelId}> was cancelled due to an error. Please try again.`;
    }

    await message.channel.send(declineMessage);

  } else {
    // --- Step 5: Create and Save Game Object (ONLY if all consented) ---
    console.log(`startGame: All participants consented for game in channel ${channelId}.`);

    const game = {
      gm: { consent: true, brink: '' }, // GM consented
      players: {},
      playerOrder: playerIds, // Use the original list, already confirmed they consented
      characterGenStep: 1,
      traitsRequested: false,
      theme: '',
      textChannelId: channelId,
      guildId: message.guild.id,
      voiceChannelId: gameChannel.type === ChannelType.GuildVoice ? channelId : null, // Use channel if it's a voice channel
      gameMode: gameChannel.type === ChannelType.GuildVoice ? 'voice-plus-text' : 'text-only',
      initiatorId: message.author.id,
      gmId: gmId,
      diceLost: 0,
    };

    // Initialize player data
    for (const player of players) {
      game.players[player.id] = {
        playerUsername: player.user.username,
        consent: true, // Player consented
        brink: '',
        moment: '',
        virtue: '',
        vice: '',
        name: '',
        look: '',
        concept: '',
        recordings: '', // Changed from recording to recordings
        hopeDice: 0,
        virtueBurned: false,
        viceBurned: false,
        momentBurned: false,
        isDead: false,
        // Default stack/trait info for validation schema
        availableTraits: ['Virtue', 'Vice', 'Moment'],
        stackOrder: [],
        initialChoice: null,
        inventoryConfirmed: false, // Important for step 7
        gear: [], // Initialize gear array
        // Add language/voice if needed later, keep null for now
        language: null,
        voice: null,
      };
    }

    // Add the game to the global gameData object
    setGameData(channelId, game); // Use setGameData from utils
    console.log(`startGame: gameData object created and added for channel ${channelId}`);
    saveGameData(); // Save the updated global gameData
    console.log(`startGame: gameData saved.`);

    // Send confirmation DMs
    await Promise.all(allParticipants.map(participant =>
      sendConsentConfirmation(participant.user, consentResults.get(participant.id).type, channelId)
        .catch(err => console.warn(`startGame: Failed to send confirmation DM to ${participant.user.tag}: ${err.message}`))
    ));

    // Start the game in the channel
    await message.channel.send(newGameMessage);

    // --- Step 6: Join Voice Channel (if applicable) ---
    if (game.gameMode === 'voice-plus-text' && game.voiceChannelId) {
      const voiceChannel = client.channels.cache.get(game.voiceChannelId);
      if (voiceChannel && voiceChannel.type === ChannelType.GuildVoice) {
        try {
          const existingConnection = getVoiceConnection(game.guildId);
          if (!existingConnection) {
            console.log(`startGame: Attempting to join voice channel ${voiceChannel.name} (${game.voiceChannelId})`);
            joinVoiceChannel({
              channelId: game.voiceChannelId,
              guildId: game.guildId,
              adapterCreator: message.guild.voiceAdapterCreator,
              selfDeaf: false,
              selfMute: false
            });
            await message.channel.send(`Joined voice channel <#${game.voiceChannelId}>.`);
            await new Promise(resolve => setTimeout(resolve, 500)); // Small delay
          } else {
            console.log(`startGame: Bot already has a voice connection in guild ${game.guildId}.`);
          }
        } catch (error) {
          console.error(`startGame: Failed to join voice channel ${game.voiceChannelId}:`, error);
          message.channel.send(`⚠️ Error joining voice channel <#${game.voiceChannelId}>. Voice features may be unavailable. Please check my permissions.`).catch(console.error);
        }
      } else {
        console.warn(`startGame: Could not find voice channel ${game.voiceChannelId} or it's not a voice channel.`);
        message.channel.send(`⚠️ Could not find the designated voice channel <#${game.voiceChannelId}>. Voice features will be unavailable.`).catch(console.error);
      }
    } // End of voice channel joining logic

    // --- Step 7: Start Character Generation ---
    // Fetch the game data *after* setting and saving it
    const newlyCreatedGame = getGameData(channelId);
    if (newlyCreatedGame) {
      // Now call sendCharacterGenStep, regardless of voice success/failure
      sendCharacterGenStep(gameChannel, newlyCreatedGame);
    } else {
      console.error(`startGame: Failed to retrieve game data immediately after saving for channel ${channelId}.`);
      message.channel.send("An internal error occurred after saving the game. Please try starting again or contact the bot administrator.");
    }
  }
}