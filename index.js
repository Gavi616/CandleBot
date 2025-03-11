import 'dotenv/config';
import { Client, EmbedBuilder, ChannelType, GatewayIntentBits, VoiceChannel, } from 'discord.js';
import { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, getVoiceConnection } from '@discordjs/voice';
import ytdl from 'ytdl-core';
import fs from 'fs';
import { helpEmbed } from './embed.js';

export const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.DirectMessageReactions,
    GatewayIntentBits.DirectMessageTyping,
    GatewayIntentBits.GuildPresences
  ],
});

const prefix = '.';
const version = '0.9.0';
const isTesting = false;

const defaultVirtues = [
  'Courageous', 'Compassionate', 'Just', 'Wise', 'Temperate', 'Hopeful', 'Faithful', 'Loving', 'Loyal', 'Honest',
  'Generous', 'Patient', 'Diligent', 'Forgiving', 'Kind', 'Optimistic', 'Reliable', 'Respectful', 'Selfless', 'Sincere',
  'Tolerant', 'Trustworthy', 'Understanding', 'Vigilant', 'Witty', 'Adaptable', 'Ambitious', 'Charitable', 'Creative', 'Decisive'
];

const defaultVices = [
  'Greedy', 'Wrathful', 'Envious', 'Slothful', 'Proud', 'Gluttonous', 'Lustful', 'Treacherous', 'Deceitful', 'Cowardly',
  'Jealous', 'Malicious', 'Pessimistic', 'Reckless', 'Resentful', 'Rude', 'Selfish', 'Stubborn', 'Suspicious', 'Vain',
  'Vengeful', 'Wasteful', 'Withdrawn', 'Arrogant', 'Bitter', 'Careless', 'Cruel', 'Dishonest', 'Frivolous', 'Hateful'
];

const defaultMoments = [
  "Find a way to signal for help.",
  "Locate a safe place to rest.",
  "Protect a vulnerable person.",
  "Discover the source of the strange noises.",
  "Retrieve a lost item of importance.",
  "Find a way to communicate with the outside world.",
  "Repair a broken piece of equipment.",
  "Find a hidden cache of supplies.",
  "Escape from a dangerous location.",
  "Provide light in the darkness to help a friend."
];

function sanitizeString(str) {
  if (typeof str !== 'string') {
    return ''; // Return an empty string if not a string
  }

  // Remove control characters (except newline and tab, if you want to keep them)
  str = str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\uFFFF]/g, ''); // Removes all control characters except \t \n
  // Escape double quotes
  str = str.replace(/"/g, '\\"');
  // Escape backslashes
  str = str.replace(/\\/g, '\\\\');

  return str;
}

let gameData = {};

function loadGameData() {
  try {
    const data = fs.readFileSync('gameData.json', 'utf8');
    gameData = JSON.parse(data);
    console.log('Game data loaded successfully.');
    printActiveGames();
  } catch (err) {
    console.error('Error loading game data:', err);
    gameData = {};
    console.log('Game data initialized.');
  }
}

function saveGameData() {
  try {
    for (const channelId in gameData) {
      gameData[channelId].lastSaved = new Date().toISOString();
    }
    fs.writeFileSync('gameData.json', JSON.stringify(gameData));
    console.log('Game data saved successfully.');
    printActiveGames();
  } catch (err) {
    console.error('Error saving game data:', err);
  }
}

function printActiveGames() {
  if (Object.keys(gameData).length === 0) {
    console.log('-- No Active Games --');
  } else {
    console.log('--- Active Games ---');
    for (const channelId in gameData) {
      client.channels.fetch(channelId)
        .then(channel => {
          if (channel && channel.guild) {
            console.log(`Server: ${channel.guild.name}, Channel: ${channel.name}`);
          } else {
            console.log(`Channel ID: ${channelId} (Channel or Guild not found)`);
          }
        })
        .catch(error => {
          console.error(`Error fetching channel ${channelId}:`, error);
          console.log(`Channel ID: ${channelId} (Error fetching channel)`);
        });
    }
  }
}

client.once('ready', () => {
  const startupTimestamp = new Date().toLocaleString();
  console.log(`Ten Candles Bot (v${version}) is ready @ ${startupTimestamp}`);
  try {
    loadGameData();
  } catch (loadError) {
    console.error('Error during loadGameData in ready event:', loadError);
  }
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  const channelId = message.channel.id;
  const userId = message.author.id;
  const userName = message.author.username; // Get username

  if (message.channel.type !== ChannelType.DM) {
    if (message.content.startsWith(prefix)) {
      const args = message.content.slice(prefix.length).trim().split(/ +/);
      const command = args.shift().toLowerCase();

      // Check if the command requires a game in progress
      const gameRequiredCommands = ['conflict', 'playrecordings', 'nextstep', 'gamestatus', 'removeplayer', 'leavegame', 'cancelgame', 'died', 'me', 'x'];

      if (gameRequiredCommands.includes(command)) {
        // Check if a game exists in the channel
        if (!gameData[channelId]) {
          message.author.send(`Message removed. There is no **Ten Candles** game in progress in #${message.channel.name}.`);
          try {
            await message.delete(); // Delete the command message
          } catch (deleteError) {
            console.error(`Failed to delete message in #${message.channel.name}:`, deleteError);
          }
          console.log(`${userName} (${userId}) tried to use .${command} in ${message.channel.name}, but there is no game in progress.`);
          return; // Stop processing the command
        }

        // Check if the user is a participant (player or GM)
        const game = gameData[channelId];
        if (!game.players[userId] && game.gmId !== userId) {
          message.author.send(`Message removed. You are not a participant in the **Ten Candles** game in #${message.channel.name}.`);
          try {
            await message.delete(); // Delete the command message
          } catch (deleteError) {
            console.error(`Failed to delete message in #${message.channel.name}:`, deleteError);
          }
          console.log(`${userName} (${userId}) tried to use .${command} in #${message.channel.name}, but is not a participant.`);
          return; // Stop processing the command
        }
      }

      // Command handling logic
      if (command === 'help') {
        message.channel.send({ embeds: [helpEmbed.help] });
      } else if (command === 'startgame') {
        await startGame(message);
      } else if (command === 'conflict') {
        await conflict(message, args);
      } else if (command === 'playrecordings') {
        await playRecordings(message);
      } else if (command === 'nextstep') {
        nextStep(message);
      } else if (command === 'gamestatus') {
        gameStatus(message);
      } else if (command === 'removeplayer') {
        removePlayer(message, args);
      } else if (command === 'leavegame') {
        leaveGame(message, args);
      } else if (command === 'cancelgame') {
        await cancelGame(message);
      } else if (command === 'died') {
        await died(message, args);
      }
    }
  }

  if (message.channel.type === ChannelType.DM) {
    const game = Object.values(gameData).find(game => {
      if (game.gmId === userId) return true;
      if (game.players && game.players[userId]) return true;
      return false;
    });

    // .x and .me command listener (for Direct Messaging)
    if (message.content.toLowerCase() === '.x') {
      const gameChannelId = Object.keys(gameData).find(key => gameData[key] === game);
      if (gameChannelId) {
        const gameChannel = client.channels.cache.get(gameChannelId);
        if (gameChannel) {
          gameChannel.send(`One or more players and/or the GM are ready to move on, please wrap up the scene quickly.`);
        }
      }
    } else if (message.content.toLowerCase() === '.me') {
      me(message);
    }

    //Check if there is a game and if that game is waiting for character info.
    if (game && game.characterGenStep === 1) {
      await handleCharacterGenStep1DM(message, game);
    } else if (game && game.characterGenStep === 4) {
      await handleCharacterGenStep4DM(message, game);
    } else if (game && game.characterGenStep === 5) {
      await handleCharacterGenStep5DM(message, game);
    } else if (game && game.characterGenStep === 6) {
      await handleCharacterGenStep6DM(message, game);
    } else if (game && game.characterGenStep === 8) {
      await handleCharacterGenStep8DM(message, game);
    }
  }
});

async function handleCharacterGenStep1DM(message, game) {
  const userId = message.author.id;
  const channelId = Object.keys(gameData).find(key => gameData[key] === game);
  const players = game.players;

  const [virtue, vice] = message.content.split(',').map(s => s.trim());
  if (virtue && vice) {
    players[userId].virtue = sanitizeString(virtue);
    players[userId].vice = sanitizeString(vice);
    saveGameData();
    try {
      await message.reply('Traits received!');
    } catch (error) {
      console.error(`Error replying to player ${userId}:`, error);
    }
    const allTraitsReceived = Object.values(players).every(player => player.virtue && player.vice);
    if (allTraitsReceived) {
      const gameChannel = client.channels.cache.get(channelId);
      if (gameChannel) {
        gameData[channelId].characterGenStep++;
        saveGameData();
        sendCharacterGenStep({ channel: gameChannel }, channelId);
      }
    }
  } else {
    try {
      await message.reply('Invalid format. Please provide your Virtue and Vice, separated by a comma (e.g., "Courageous, Greedy").');
    } catch (error) {
      console.error(`Error replying to player ${userId}:`, error);
    }
  }
}

async function handleCharacterGenStep4DM(message, game) {
  const userId = message.author.id;
  const channelId = Object.keys(gameData).find(key => gameData[key] === game);
  const players = game.players;

  players[userId].moment = sanitizeString(message.content);
  saveGameData();
  try {
    await message.reply('Moment received!');
  } catch (error) {
    console.error(`Error replying to player ${userId}:`, error);
  }
  const allMomentsReceived = Object.values(players).every(player => player.moment);
  if (allMomentsReceived) {
    const gameChannel = client.channels.cache.get(channelId);
    if (gameChannel) {
      gameData[channelId].characterGenStep++;
      saveGameData();
      sendCharacterGenStep({ channel: gameChannel }, channelId);
    }
  }
}

async function handleCharacterGenStep5DM(message, game) {
  const userId = message.author.id;
  const channelId = Object.keys(gameData).find(key => gameData[key] === game);
  const players = game.players;
  const playerOrder = game.playerOrder;
  const gmId = game.gmId;

  const brinkResponses = game.brinkResponses || {};
  brinkResponses[userId] = sanitizeString(message.content);
  game.brinkResponses = brinkResponses;

  const allBrinksReceived = Object.keys(brinkResponses).length === playerOrder.length + 1;

  if (allBrinksReceived) {
    // Distribute Brinks
    const threatPlayerId = playerOrder.find(id => id in brinkResponses && id !== gmId);
    for (const playerId of playerOrder) {
      if (playerId === threatPlayerId) {
        game.gm.brink = brinkResponses[gmId];
      } else {
        const nextPlayerId = playerOrder[(playerOrder.indexOf(playerId) + 1) % playerOrder.length];
        players[playerId].brink = brinkResponses[nextPlayerId];
      }
    }
    players[threatPlayerId].brink = brinkResponses[threatPlayerId];
    saveGameData();
    const gameChannel = client.channels.cache.get(channelId);
    if (gameChannel) {
      gameChannel.send('Brinks have been distributed. Proceeding to the next step.');
      gameData[channelId].characterGenStep++;
      sendCharacterGenStep({ channel: gameChannel }, channelId);
    }
  }
}

async function handleCharacterGenStep6DM(message, game) {
  const channelId = Object.keys(gameData).find(key => gameData[key] === game);
  const gameChannel = client.channels.cache.get(channelId);
  if (gameChannel) {
    sendCharacterGenStep({ channel: gameChannel }, channelId);
  }
}

async function handleCharacterGenStep8DM(message, game) {
  const userId = message.author.id;
  const players = game.players;
  const channelId = Object.keys(gameData).find(key => gameData[key] === game);

  if (game.gameMode === 'text-only') {
    if (message.attachments.size > 0) {
      try {
        await message.channel.send('Audio attachments are not supported in text-only mode. Please send a text message instead.');
      } catch (error) {
        console.error(`Error replying to player ${userId}:`, error);
      }
    } else if (message.content) {
      players[userId].recording = sanitizeString(message.content);
      saveGameData();
      try {
        await message.channel.send('Your text message was received!');
      } catch (error) {
        console.error(`Error replying to player ${userId}:`, error);
      }
    }
  } else if (game.gameMode === 'voice-plus-text') {
    if (message.attachments.size > 0 && message.attachments.first().contentType.startsWith('audio/')) {
      players[userId].recording = message.attachments.first().url;
      saveGameData();
      try {
        await message.channel.send('Your audio recording was received!');
      } catch (error) {
        console.error(`Error replying to player ${userId}:`, error);
      }
    } else if (message.content) {
      players[userId].recording = sanitizeString(message.content);
      saveGameData();
      try {
        await message.channel.send('Your text message was received!');
      } catch (error) {
        console.error(`Error replying to player ${userId}:`, error);
      }
    }
  }

  const allRecordingsReceived = Object.values(players).every(player => player.recording);
  if (allRecordingsReceived) {
    const gameChannel = client.channels.cache.get(channelId);
    if (gameChannel) {
      try {
        gameChannel.send('All final recordings were received! Proceeding to start the game.');
      } catch (error) {
        console.error(`Error sending message to game channel ${channelId}:`, error);
      }
      gameData[channelId].characterGenStep = 9;
      saveGameData();
      setTimeout(() => {
        sendCharacterGenStep({ channel: gameChannel }, channelId);
      }, 5000);
    }
  }
}

export async function startGame(message) {
  const channelId = message.channel.id;
  const args = message.content.split(' ').slice(1);

  if (gameData[channelId]) {
    message.reply('A **Ten Candles** game is already in progress here.');
    return;
  }

  if (args.length < 3) {
    message.reply('A **Ten Candles** game requires a GM and at least 2 players. Usage: `.startgame <GM ID> <Player IDs (space-separated)>`');
    return;
  }

  const gmId = args[0].replace(/<@!?(\d+)>/, '$1');
  const playerIds = args.slice(1).map(id => id.replace(/<@!?(\d+)>/, '$1'));

  if (playerIds.length < 2 || playerIds.length > 10) {
    message.reply('A **Ten Candles** game requires a GM and at least 2 players (to a maximum of 10 players). No game was started.');
    return;
  }

  const gm = message.guild.members.cache.get(gmId);
  if (!gm) {
    message.reply('Invalid GM ID. Please mention a valid user in this server. No game was started.');
    return;
  }

  if (!isTesting && new Set(playerIds).size !== playerIds.length) {
    message.reply('Duplicate players found. Each player must be a unique user. No game was started.');
    return;
  }

  if (!isTesting && playerIds.includes(gmId)) {
    message.reply('The GM cannot also be a player. No game was started.');
    return;
  }

  for (const playerId of playerIds) {
    const player = message.guild.members.cache.get(playerId);
    if (!player) {
      message.reply(`Invalid Player ID: <@${playerId}>. Please mention a valid user in this server. No game was started.`);
      return;
    }
  }

  if (gm.presence?.status === 'offline') {
    message.reply('The GM must be online to start a game. No game was started.');
    return;
  }

  const offlinePlayers = playerIds.filter(playerId => {
    const player = message.guild.members.cache.get(playerId);
    return player.presence?.status === 'offline';
  });

  if (offlinePlayers.length > 0) {
    message.reply(`The following players must be online to start a game: ${offlinePlayers.map(id => `<@${id}>`).join(', ')}. No game was started.`);
    return;
  }

  // Detect if the command is used in a voice channel
  const voiceChannel = message.member.voice.channel;
  const gameMode = voiceChannel ? 'voice-plus-text' : 'text-only';
  const voiceChannelId = voiceChannel ? voiceChannel.id : null;

  gameData[channelId] = {
    dicePool: -1,
    scene: 0,
    characterGenStep: 1,
    players: {},
    diceLost: 0,
    playerOrder: playerIds,
    gmId: gmId,
    gameMode: gameMode,
    voiceChannelId: voiceChannelId,
    textChannelId: channelId,
    brinkResponses: {},
    gm: {
      consent: false,
      gmUsername: gm.user.username,
      brink: '',
    },
  };

  for (const playerId of playerIds) {
    gameData[channelId].players[playerId] = {
      consent: false,
      playerUsername: message.guild.members.cache.get(playerId)?.user.username || 'Unknown Player',
      virtue: '',
      virtueBurned: false,
      vice: '',
      viceBurned: false,
      moment: '',
      momentBurned: false,
      brink: '',
      name: '',
      look: '',
      concept: '',
      recording: '',
      hopeDice: 0,
      isDead: false,
    };
  }

  saveGameData();

  // GM Consent
  try {
    const gm = message.guild.members.cache.get(gmId);
    const dmChannel = await gm.user.createDM();
    await gm.user.send(`You have been designated as the GM role for a **Ten Candles** game in #${message.guild.name}. Do you consent to participate? (y/n) You have 60 seconds to respond.`);

    const gmFilter = m => m.author.id === gmId && (m.content.toLowerCase().startsWith('y') || m.content.toLowerCase().startsWith('n'));
    const gmCollected = await dmChannel.awaitMessages({ gmFilter, max: 1, time: 60000, errors: ['time'] });

    gameData[channelId].gm.consent = gmCollected.size > 0 && gmCollected.first().content.toLowerCase().startsWith('y');

    if (!gameData[channelId].gm.consent) {
      message.channel.send('The GM did not consent. Game cancelled.');
      delete gameData[channelId];
      saveGameData();
      return;
    }
  } catch (error) {
    console.error('Error requesting GM consent:', error);
    if (error.message === 'time') {
      message.channel.send('GM consent timed out. Game cancelled.');
    } else {
      message.channel.send('GM consent failed. Please check the console for details. Game cancelled.');
    }
    delete gameData[channelId];
    saveGameData();
    return;
  }

  // Player Consents (Concurrent)
  const playerConsentPromises = playerIds.map(async (playerId) => {
    try {
      const player = await message.guild.members.fetch(playerId);
      const user = player.user;

      if (user.bot) {
        message.channel.send(`Player <@${playerId}> is a bot and cannot be a player. Game cancelled.`);
        delete gameData[channelId];
        saveGameData();
        return false; // Indicate failure
      }

      if (isTesting) {
        gameData[channelId].players[playerId].consent = true;
        console.log(`Player <@${playerId}> consent bypassed in testing mode.`);
        return true; // Indicate success
      }

      const dmChannel = await user.createDM();
      await user.send(`You have been added as a player to a **Ten Candles** game in #${message.guild.name}. Do you consent to participate? (y/n) You have 60 seconds to respond.`);

      const filter = m => m.author.id === playerId && (m.content.toLowerCase().startsWith('y') || m.content.toLowerCase().startsWith('n'));
      const collected = await dmChannel.awaitMessages({ filter, max: 1, time: 60000, errors: ['time'] });

      gameData[channelId].players[playerId].consent = collected.size > 0 && collected.first().content.toLowerCase().startsWith('y');

      if (!gameData[channelId].players[playerId].consent) {
        message.channel.send(`Player <@${playerId}> did not consent. Game cancelled.`);
        delete gameData[channelId];
        saveGameData();
        return false; // Indicate failure
      }
      return true; // Indicate success
    } catch (error) {
      console.error(`Error requesting player ${playerId} consent:`, error);
      if (error.message === 'time') {
        message.channel.send(`Player <@${playerId}> consent timed out. Game cancelled.`);
      } else {
        message.channel.send(`Player <@${playerId}> consent failed. Please check the console for details. Game cancelled.`);
      }
      delete gameData[channelId];
      saveGameData();
      return false; // Indicate failure
    }
  });

  const playerConsentResults = await Promise.all(playerConsentPromises);

  if (playerConsentResults.includes(false)) {
    // A player did not consent or an error occurred
    return; // Stop the startGame function
  }

  let confirmationMessage = '**The World of Ten Candles**\n';
  confirmationMessage += 'Your characters will face unimaginable terrors in the dying of the light.\n\n';
  confirmationMessage += '**Though you know your characters will die, you must have hope that they will survive.**\n\n';
  confirmationMessage += '**Ten Candles** focuses around shared narrative control.\n';
  confirmationMessage += 'Everyone will share the mantle of storyteller and have an equal hand in telling this dark story.\n\n';
  confirmationMessage += 'Let\'s begin character generation.\nUse the `.nextstep` command to proceed.';

  if (gameMode === 'voice-plus-text') {
    confirmationMessage += `\n\n**Voice Channel:** <#${voiceChannelId}> has been set up for audio playback.`;
    message.channel.send(confirmationMessage)
      .then(() => {
        sendCharacterGenStep(message, channelId);
      })
      .catch((error) => {
        console.error('Error sending initial message:', error);
        message.channel.send('Failed to send initial message. Check the console for details. Game cancelled.');
        delete gameData[channelId];
        saveGameData();
      });
  } else {
    confirmationMessage += '\n\n**Text-Only Mode:** Audio playback is not supported in this channel. Final recordings will be text-only.';
    message.channel.send(confirmationMessage)
      .then(() => {
        sendCharacterGenStep(message, channelId);
      })
      .catch((error) => {
        console.error('Error sending initial message:', error);
        message.channel.send('Failed to send initial message. Check the console for details. Game cancelled.');
        delete gameData[channelId];
        saveGameData();
      });
  }
}

async function gameStatus(message) {
  const channelId = message.channel.id;
  if (!gameData[channelId]) {
    message.reply('No game is in progress in this channel.');
    return;
  }

  const game = gameData[channelId];
  const gmId = game.gmId;
  const playerIds = Object.keys(game.players);

  let gmMention = `<@${gmId}>`;
  let playerMentions = playerIds.map(playerId => `<@${playerId}>`).join(', ');

  const content = game.characterGenStep > 0
    ? `Character Generation Step: ${game.characterGenStep}\nGM: ${gmMention}\nPlayers: ${playerMentions}\nUse the \`.nextstep\` command to proceed.`
    : `Scene: ${game.scene}\nGM: ${gmMention}\nPlayers: ${playerMentions}\nUse the \`.conflict\` command to take an action and move the game forward.`;

  message.channel.send({
    content: content,
    allowedMentions: {
      parse: [], // Disallow parsing of mentions (no beep / notification)
    },
  });
}

async function me(message) {
  const playerId = message.author.id;
  const playerNumericId = parseInt(playerId);
  let channelId = message.channel.id; // Initialize channelId

  if (message.channel.type !== 1) { // Check if it's a DM
    try {
      await message.author.send('This command can only be used in a direct message.');
    } catch (error) {
      console.error('Could not send DM to user:', error);
    }
    return;
  }

  let game;
  for (const channel in gameData) {
    if (gameData[channel].players && gameData[channel].players[playerNumericId]) {
      game = gameData[channel];
      channelId = channel;
      break;
    }
  }

  if (!game) {
    message.reply('You are not currently in a game.');
    return;
  }

  const player = game.players[playerNumericId];

  const characterEmbed = new EmbedBuilder()
    .setColor(0x0099FF)
    .setTitle(`Character Sheet: ${player.name || message.author.username}`)
    .addFields(
      { name: 'Virtue', value: player.virtue || 'Not set', inline: true },
      { name: 'Vice', value: player.vice || 'Not set', inline: true },
      { name: 'Moment', value: player.moment || 'Not set' },
      { name: 'Brink', value: player.brink || 'Not set' },
      { name: 'Hope Dice', value: player.hopeDice.toString() || '0' },
      { name: 'Recordings', value: player.recordings || 'Not set' },
      { name: 'Is Dead', value: player.isDead ? 'Yes' : 'No' },
      { name: 'Virtue Burned', value: player.virtueBurned ? 'Yes' : 'No', inline: true },
      { name: 'Vice Burned', value: player.viceBurned ? 'Yes' : 'No', inline: true },
      { name: 'Moment Burned', value: player.momentBurned ? 'Yes' : 'No' },
    )
    .setTimestamp();

  try {
    await message.author.send({ embeds: [characterEmbed] }); // Send DM
    if (message.channel.type !== 1) {
      await message.delete(); // Delete original message
    }

  } catch (error) {
    console.error('Could not send character sheet DM:', error);
    if (message.channel.type !== 1) {
      await message.reply('Could not send character sheet DM. Please enable DMs.'); // Inform in channel if DM fails.
    }
  }
}

export async function cancelGame(message) {
  const channelId = message.channel.id;
  if (!gameData[channelId]) {
    message.reply('No game is in progress in this channel.');
    return;
  }
  const gmId = gameData[channelId].gmId;

  try {
    const gm = message.guild.members.cache.get(gmId);
    const dmChannel = await gm.user.createDM();
    await gm.user.send(`Are you sure you want to cancel the game in #${message.channel.name}? (y/n) You have 60 seconds to respond.`);

    const filter = m => m.author.id === gmId && (m.content.toLowerCase().startsWith('y') || m.content.toLowerCase().startsWith('n'));
    const collected = await dmChannel.awaitMessages({ filter, max: 1, time: 60000, errors: ['time'] });

    if (collected.size > 0 && collected.first().content.toLowerCase().startsWith('y')) {
      delete gameData[channelId];
      saveGameData();
      message.channel.send(`Game in #${message.channel.name} has been cancelled by the GM.`);
    } else {
      message.channel.send('Game cancellation was aborted by GM.');
    }
  } catch (error) {
    console.error('Error requesting GM confirmation to cancel game:', error);
    message.channel.send('Failed to request GM confirmation. Game not cancelled.');
  }
}

function getVirtualTableOrder(game, withGM = true) {
  if (withGM) {
    return [...game.playerOrder, game.gmId];
  } else {
    return [...game.playerOrder];
  }
}

export async function died(message, args) {
  const channelId = message.channel.id;
  const game = gameData[channelId];

  if (!game) {
    message.reply('No game is in progress in this channel.');
    return;
  }

  if (message.author.id !== game.gmId) {
    message.reply('Only the GM can use this command.');
    return;
  }

  if (args.length < 1) {
    message.reply('Usage: .died <Player ID> [-martyr] [Cause of Death]');
    return;
  }

  const playerIdToDie = args[0].replace(/<@!?(\d+)>/, '$1');
  const isMartyr = args.includes('-martyr');
  const causeOfDeath = args.slice(1).filter(arg => arg !== '-martyr').join(' ') || 'an unknown cause.';

  if (!game.players[playerIdToDie]) {
    message.reply('Invalid Player ID. Please mention a valid player in this game.');
    return;
  }

  game.players[playerIdToDie].isDead = true;

  if (isMartyr && game.players[playerIdToDie].hopeDice > 0) {
    // Martyrdom and Hope Die Gifting
    await handleMartyrdom(message, playerIdToDie, game);
  }

  saveGameData();

  const playerName = game.players[playerIdToDie].name;
  const martyrMessage = isMartyr ? ' (Martyred)' : '';
  message.channel.send(`**${playerName || `<@${playerIdToDie}>'s unnamed character`} has died from ${causeOfDeath}${martyrMessage}!**\nPlease work with the GM to narrate your character's death.`);
}

async function handleMartyrdom(message, playerIdToDie, game) {
  const player = game.players[playerIdToDie];
  const dmChannel = await message.guild.members.cache.get(playerIdToDie).user.createDM();

  await dmChannel.send('Choose a player to gift your Hope die(s) to (mention them):');

  const filter = m => {
    //Filter any messages that aren't from the player, and don't mention someone.
    if (m.author.id !== playerIdToDie || m.mentions.users.size === 0) return false;
    //Filter out any mention of the GM.
    const mentionedUser = m.mentions.users.first();
    if (mentionedUser.id === game.gmId) return false;
    //Filter out any users that aren't in the game, or have died.
    if (!game.players[mentionedUser.id] || game.players[mentionedUser.id].isDead) return false;
    return true;
  };
  const collected = await dmChannel.awaitMessages({ filter, max: 1, time: 60000, errors: ['time'] });

  if (collected.size > 0) {
    const recipientId = collected.first().mentions.users.first().id;

    game.players[recipientId].hopeDice += player.hopeDice;
    player.hopeDice = 0; // Remove hope dice from the dead player.
    saveGameData();
    await dmChannel.send(`Your Hope die(s) have been gifted to <@${recipientId}>.`);
    message.channel.send(`<@${playerIdToDie}> has gifted their Hope die(s) to <@${recipientId}>.`);
  } else {
    await dmChannel.send('No valid recipient chosen.');
  }
}

async function leaveGame(message, args) {
  const channelId = message.channel.id;
  const game = gameData[channelId];
  const playerId = message.author.id;

  if (!game) {
    message.reply('No game is in progress in this channel.');
    return;
  }

  if (!game.players[playerId]) {
    message.reply('You are not a player in this game.');
    return;
  }

  const reason = args.join(' ') || 'No reason provided.';

  delete game.players[playerId];
  game.playerOrder = game.playerOrder.filter(id => id !== playerId);

  saveGameData();

  message.channel.send(`<@${playerId}> has left the game. Reason: ${reason}`);
}

async function removePlayer(message, args) {
  const channelId = message.channel.id;
  const game = gameData[channelId];

  if (!game) {
    message.reply('No game is in progress in this channel.');
    return;
  }

  if (message.author.id !== game.gmId) {
    message.reply('Only the GM can use this command.');
    return;
  }

  if (args.length < 1) {
    message.reply('Usage: .removeplayer <Player ID> [Reason]');
    return;
  }

  const playerIdToRemove = args[0].replace(/<@!?(\d+)>/, '$1'); // Extract player ID from mention

  if (!game.players[playerIdToRemove]) {
    message.reply('Invalid Player ID. Please mention a valid player in this game.');
    return;
  }

  let reason = args.slice(1).join(' '); // Extract the reason (if any)

  delete game.players[playerIdToRemove];

  game.playerOrder = game.playerOrder.filter(id => id !== playerIdToRemove);

  saveGameData();

  if (reason) {
    message.channel.send(`<@${playerIdToRemove}> has been removed from the game. Reason: ${reason}`);
  } else {
    message.channel.send(`<@${playerIdToRemove}> has been removed from the game.`);
  }
}

async function sendCharacterGenStep(message, channelId) {
  const step = gameData[channelId].characterGenStep;
  const players = gameData[channelId].players;
  const playerOrder = gameData[channelId].playerOrder;
  const gmId = gameData[channelId].gmId;

  if (step === 1) {
    message.channel.send('\n**Step One: Players Write Traits (light three candles)**\nPlayers, check your DMs and reply with a Virtue and a Vice.\nYou have 5 minutes to complete this step.');
    sendCandleStatus(message, 3);
    saveGameData();
  } else if (step === 2) {
    message.channel.send('**Step Two: GM Introduces the Module / Theme**\nTraits have been swapped (check your DMs and look over what you have received). Write your Virtue and Vice on two index cards. The GM will now introduce the module/theme. Use `.nextstep` when you are ready to continue.');
    const swappedTraits = swapTraits(players, gameData[channelId], message.guild);
    gameData[channelId].players = swappedTraits;
    saveGameData();
  } else if (step === 3) {
    message.channel.send('**Step Three: Players Create Concepts**\nPlayers, check your DMs and respond with your character\'s Name, Look and Concept, in that order as three separate messages.\nYou have 5 minutes to complete this step.');
    await askPlayersForCharacterInfo(message, channelId);
    gameData[channelId].characterGenStep++;
    saveGameData();
    sendCharacterGenStep(message, channelId);
  } else if (step === 4) {
    message.channel.send('**Step Four: Players Plan Moments (light three more candles)**\nMoments are an event that would be reasonable to achieve, kept succinct and clear to provide strong direction. However, all Moments should have potential for failure.\nYou have 5 minutes to respond.');

    sendCandleStatus(message, 6);
    const momentPromises = playerOrder.map(async (playerId) => {
      try {
        const player = await message.guild.members.fetch(playerId);
        const user = player.user;
        const dmChannel = await user.createDM();
        await user.send('Please DM me your Moment.');

        const filter = m => m.author.id === playerId;
        const collected = await dmChannel.awaitMessages({ filter, max: 1, time: 300000, errors: ['time'] });

        if (collected.size > 0) {
          gameData[channelId].players[playerId].moment = collected.first().content;
        } else {
          assignRandomMoment(user, gameData[channelId].players[playerId]);
        }
      } catch (error) {
        console.error(`Error handling Moment for player ${playerId}:`, error);
        assignRandomMoment(user, gameData[channelId].players[playerId]);
      }
    });
    await Promise.all(momentPromises);
    saveGameData();
  } else if (step === 5) {
    message.channel.send('**Step Five: Players and GM Discover Brinks (light three more candles)**\nCheck your DMs for personalized instructions on this step.\nYou have five minutes to respond.');
    sendCandleStatus(message, 9);
    const players = gameData[channelId].players;
    const playerOrder = gameData[channelId].playerOrder;
    const gmId = gameData[channelId].gmId;

    // Randomly select the player for the "threat detail"
    const threatPlayerId = playerOrder[Math.floor(Math.random() * playerOrder.length)];

    // Send DM prompts to players
    for (const playerId of playerOrder) {
      const player = message.guild.members.cache.get(playerId);
      let prompt;
      if (playerId === threatPlayerId) {
        prompt = 'Write, “I have seen them..” & give a detail about the threat without outright identifying them.';
      } else {
        const nextPlayerId = playerOrder[(playerOrder.indexOf(playerId) + 1) % playerOrder.length];
        const nextPlayerUsername = players[nextPlayerId].playerUsername;
        prompt = `Please write a short descriptive phrase of when or where you saw the Brink of ${nextPlayerUsername}.`;
      }

      try {
        await player.user.send(prompt);
      } catch (error) {
        console.error(`Error DMing player ${playerId}:`, error);
      }
    }

    // Send DM prompt to GM
    try {
      const gm = message.guild.members.cache.get(gmId);
      const threatPlayerUsername = players[threatPlayerId].playerUsername;
      await gm.user.send(`Please DM me a short descriptive phrase of when or where (and who) saw the Brink of ${threatPlayerUsername}.`);
    } catch (error) {
      console.error(`Error DMing GM ${gmId}:`, error);
    }
  } else if (step === 6) {
    message.channel.send('**Step Six: Arrange Traits**\nPlayers should now arrange their Traits, Moment, and Brink cards. Your Brink must go on the bottom of the stack, face down.');
    const swappedBrinks = swapBrinks(players, playerOrder, gmId);
    gameData[channelId].players = swappedBrinks;
    saveGameData();
    const brinkSwapPromises = playerOrder.map(async (playerId) => {
      try {
        const player = await message.guild.members.fetch(playerId);
        const user = player.user;
        await user.send(`Your swapped Brink is: ${swappedBrinks[playerId].brink}\nPlease write it on an index card.`);
      } catch (error) {
        console.error(`Error DMing player ${playerId} for swapped brink:`, error);
      }
    });

    await Promise.all(brinkSwapPromises);

    try {
      const gm = message.guild.members.cache.get(gmId);
      const user = gm.user;
      await user.send(`Your swapped Brink is: ${swappedBrinks[playerOrder[0]].brink}\nPlease write it on an index card.`);
    } catch (error) {
      console.error(`Error DMing GM ${gmId} for swapped brink:`, error);
    }
  } else if (step === 7) {
    message.channel.send('**Step Seven: Inventory Supplies (light the final candle)**\nYour character has whatever items you have in your pockets (or follow your GM\'s instructions, if provided). **It begins.**');
    sendCandleStatus(message, 10);
  } else if (step === 8) {
    message.channel.send('**Final Recordings**\nPlayers, please check your DMs to send in your final recordings (audio or text).');

    const players = gameData[channelId].players;
    let recordingsReceived = 0;

    for (const userId in players) {
      try {
        client.users.cache.get(userId).send('Please record your final message for the world, in character. Send it via DM as an audio file or a text message when prompted.');
      } catch (error) {
        console.error(`Error DMing user ${userId}:`, error);
      }
    }
  } else if (step === 9) {
    message.channel.send(
      '**Game Start**\n' +
      'Character generation is complete! Ten candles are lit, and the game begins.\n\n' +
      '**How to Use `.conflict`:**\n' +
      'Use the `.conflict` command to perform actions. Use modifiers such as `-burnvirtue`, `-burnvice` and `-burnmoment` as needed.\n' +
      'Buring a Virtue or Vice from the top of your stack allows your `.conflict` to reroll all ones.\n' +
      'Buring your Moment from the top of your stack will give you a valuable Hope die is the `.conflict` succeeds!\n' +
      'Example(s): `.conflict` or `.conflict -burnvice`\n\n' +
      'Candles will be extinguished as the scenes progress.\n\n' +
      '**When to Use `.playrecordings`:**\n' +
      'Once all Player Characters have perished, the GM should use the `.playrecordings` command to play their final messages and close the game session.'
    );
    gameData[channelId].dicePool = 10;
    gameData[channelId].scene = 1;
    saveGameData();
    sendCandleStatus(message, 10);
  }
}

function assignRandomTraits(user, player) {
  player.virtue = defaultVirtues[Math.floor(Math.random() * defaultVirtues.length)];
  player.vice = defaultVices[Math.floor(Math.random() * defaultVices.length)];
  user.send(`You timed out or provided invalid input. A random Virtue (${player.virtue}) and Vice (${player.vice}) have been assigned.`);
}

async function swapTraits(players, game, guild) {
  const playerOrder = getVirtualTableOrder(game, false);
  const swappedPlayers = { ...players };

  for (let i = 0; i < playerOrder.length; i++) {
    const currentPlayerId = playerOrder[i];
    const nextPlayerId = playerOrder[(i + 1) % playerOrder.length];

    swappedPlayers[nextPlayerId].virtue = players[currentPlayerId].virtue;
    swappedPlayers[nextPlayerId].vice = players[currentPlayerId].vice;
  }

  const swapTraitPromises = playerOrder.map(async (recipientId, i) => {
    const senderId = playerOrder[(i - 1 + playerOrder.length) % playerOrder.length];
    try {
      const recipientUser = (await guild.members.fetch(recipientId)).user;
      await recipientUser.send(`You received the Virtue "${swappedPlayers[recipientId].virtue}" from <@${senderId}>.`);
      await recipientUser.send(`You received the Vice "${swappedPlayers[recipientId].vice}" from <@${senderId}>.`);
    } catch (error) {
      console.error(`Error sending trait swap DMs to player ${recipientId}:`, error);
    }
  });
  await Promise.all(swapTraitPromises);
  return swappedPlayers;
}

function swapBrinks(players, playerOrder, gmId) {
  const newPlayers = { ...players };
  for (let i = 0; i < playerOrder.length; i++) {
    const currentPlayerId = playerOrder[i];
    const nextPlayerId = playerOrder[(i + 1) % playerOrder.length];
    newPlayers[currentPlayerId].brink = players[nextPlayerId].brink;
  }
  newPlayers[playerOrder[0]].brink = players[gmId].brink;
  return newPlayers;
}

export function nextStep(message) {
  const channelId = message.channel.id;
  if (!gameData[channelId]) {
    message.reply('No game is in progress in this channel.');
    return;
  }

  if (gameData[channelId].characterGenStep >= 8) {
    message.reply('Character generation is already complete. Use `.conflict` to continue the game.');
    return;
  }

  gameData[channelId].characterGenStep++;
  saveGameData();
  sendCharacterGenStep(message, channelId);
}

export async function conflict(message, args) {
  const channelId = message.channel.id;
  const playerId = message.author.id;
  const playerNumericId = parseInt(playerId);

  if (!gameData[channelId]) {
    message.reply('No game is in progress in this channel. Use `.startgame` to begin.');
    return;
  }

  if (gameData[channelId].characterGenStep < 8) {
    message.reply('Character generation is not complete. Please use `.nextstep` to proceed.');
    return;
  }

  if (!gameData[channelId].players || !gameData[channelId].players[playerNumericId]) {
    console.log(`User "${message.author.username}" (ID: ${playerId}) tried to use \`.conflict\` but is not a player.`);
    return;
  }

  if (!gameData[channelId].players) {
    gameData[channelId].players = {};
  }

  if (!gameData[channelId].players[playerId]) {
    gameData[channelId].players[playerId] = { hopeDieActive: false };
  }

  let dicePool = gameData[channelId].dicePool;
  let hopeDieRoll = 0;
  let rerollOnes = false;
  let numOnesRerolled = 0; // Initialize numOnesRerolled

  let useMoment = false;
  let useVirtue = false;
  let useVice = false;

  gameData[channelId].players[playerNumericId].brinkUsedThisRoll = false;

  if (args.includes('-burnmoment') && !gameData[channelId].players[playerNumericId].hopeDieActive && !gameData[channelId].players[playerNumericId].momentBurned) {
    message.channel.send(`<@${playerId}>, please burn your Moment now.`);
    gameData[channelId].players[playerNumericId].momentBurned = true;
    useMoment = true;
  }

  if (args.includes('-burnvirtue') && !gameData[channelId].players[playerNumericId].virtueBurned) {
    message.channel.send(`<@${playerId}>, please burn your Virtue now.`);
    gameData[channelId].players[playerNumericId].virtueBurned = true;
    useVirtue = true;
  }

  if (args.includes('-burnvice') && !gameData[channelId].players[playerNumericId].viceBurned) {
    message.channel.send(`<@${playerId}>, please burn your Vice now.`);
    gameData[channelId].players[playerNumericId].viceBurned = true;
    rerollOnes = true;
  }

  if (isTesting || gameData[channelId].players[playerId].hopeDieActive) {
    hopeDieRoll = Math.floor(Math.random() * 6) + 1;
  }

  if (useVirtue || useVice) {
    rerollOnes = true;
  }

  let rolls = [];

  if (hopeDieRoll) {
    rolls.push(hopeDieRoll);
  }
  //Roll all hope dice.
  for (let i = 0; i < gameData[channelId].players[playerNumericId].hopeDice; i++) {
    rolls.push(Math.floor(Math.random() * 6) + 1);
  }

  for (let i = 0; i < dicePool; i++) {
    rolls.push(Math.floor(Math.random() * 6) + 1);
  }

  if (rerollOnes) {
    const onesIndices = rolls.reduce((indices, roll, index) => {
      if (roll === 1 && (hopeDieRoll !== 1 || index !== 0)) {
        indices.push(index);
      }
      return indices;
    }, []);

    numOnesRerolled = onesIndices.length;

    onesIndices.forEach((index) => {
      rolls[index] = Math.floor(Math.random() * 6) + 1;
    });
  }
  // Count the number of 6s (successes) and 1s (for candle loss)
  let sixes = rolls.filter((roll) => roll >= 6).length;
  let ones = rolls.filter((roll, index) => roll === 1 && (hopeDieRoll !== 1 || index !== 0)).length; // Exclude Hope die if it's a 1
  const totalPlayerSixes = sixes;
  let gmSixes = 0;
  const gmDiceCount = 0;
  //Create the Emojis for display.
  const diceEmojis = rolls.map(roll => {
    switch (roll) {
      case 1: return '⚀';
      case 2: return '⚁';
      case 3: return '⚂';
      case 4: return '⚃';
      case 5: return '⚄';
      case 6: return '⚅';
      default: return '';
    }
  }).join('');
  const gmDiceEmojis = Array.from({ length: gmDiceCount }, () => '🎲').join('');
  const hopeDieEmoji = hopeDieRoll > 0 ? (() => {
    switch (hopeDieRoll) {
      case 1: return '⚀';
      case 2: return '⚁';
      case 3: return '⚂';
      case 4: return '⚃';
      case 5: return '⚄';
      case 6: return '⚅';
      default: return '';
    }
  })() : '';

  // Moment success check
  if (useMoment && totalPlayerSixes > 0) {
    gameData[channelId].players[playerNumericId].hopeDice++;
    message.channel.send(`<@${playerId}> has successfully achieved their Moment and gains a Hope die for future rolls.`);
  } else if (useMoment && totalPlayerSixes === 0) {
    gameData[channelId].players[playerNumericId].hopeDice = 0;
    message.channel.send(`<@${playerId}> has failed to live their Moment and loses all hope dice.`);
  }

  // Brink Logic
  let messageContent = '';

  if (totalPlayerSixes === 0) {
    // Failed Roll - Brink Prompt (DM)
    if (gameData[channelId].players[playerNumericId].momentBurned &&
      gameData[channelId].players[playerNumericId].virtueBurned &&
      gameData[channelId].players[playerNumericId].viceBurned &&
      !gameData[channelId].players[playerNumericId].brinkUsedThisRoll &&
      !gameData[channelId].players[playerNumericId].isDead) {

      try {
        const player = await message.guild.members.fetch(playerId);
        const dmChannel = await player.user.createDM();

        await dmChannel.send('You have failed this `.conflict` roll. Embrace your Brink for a full reroll? (y/n) You have 60 seconds to decide.');

        const filter = m => m.author.id === playerId && (m.content.toLowerCase().startsWith('y') || m.content.toLowerCase().startsWith('n'));
        const collected = await dmChannel.awaitMessages({ filter, max: 1, time: 60000, errors: ['time'] });

        if (collected.size > 0 && collected.first().content.toLowerCase() === 'y') {
          gameData[channelId].players[playerNumericId].brinkUsedThisRoll = true; // Set the flag
          message.channel.send(`<@${playerId}> embraced their Brink!`);

          //Clear the dice from this roll.
          rolls = [];
          numOnesRerolled = 0;
          hopeDieRoll = 0;
          //Reroll
          if (hopeDieRoll) {
            rolls.push(hopeDieRoll);
          }
          //Roll all hope dice.
          for (let i = 0; i < gameData[channelId].players[playerNumericId].hopeDice; i++) {
            rolls.push(Math.floor(Math.random() * 6) + 1);
          }

          for (let i = 0; i < dicePool; i++) {
            rolls.push(Math.floor(Math.random() * 6) + 1);
          }
          // Continue with the rest of the roll logic...
          sixes = rolls.filter((roll) => roll >= 6).length;
          ones = rolls.filter((roll, index) => roll === 1 && (hopeDieRoll !== 1 || index !== 0)).length;

        } else {
          await dmChannel.send('You chose not to embrace your Brink, for now.');
          message.channel.send(`<@${playerId}> chose not to embrace their Brink. The scene will end.`); //Inform the channel of the choice.
        }
      } catch (error) {
        if (error.message === 'time') {
          await message.guild.members.fetch(playerId).then(player => player.user.send('You did not respond in time. The scene will end.'));
          message.channel.send(`<@${playerId}>, did not respond in time. The scene will end.`);
        } else {
          console.error('Error during Brink prompt (DM):', error);
          await message.guild.members.fetch(playerId).then(player => player.user.send('An error occurred. The scene will end.'));
          message.channel.send(`<@${playerId}>, an error occurred. The scene will end.`);
        }
      }
    }

    if (gameData[channelId].scene === 10) { // Check for Last Stand (only one candle left)
      gameData[channelId].players[playerId].isDead = true;
      saveGameData();
      message.channel.send(`**${gameData[channelId].players[playerId].name || `<@${playerId}>'s unnamed character`} has died!**\nPlease work with the GM to narrate your character's death.`);
    } else {
      // Normal Candle Extinguishing
      gameData[channelId].diceLost = ones;
      //Darken a candle and advance a scene.
      messageContent += "A candle will be extinguished ending the scene after this conflict is narrated.\n";
      gameData[channelId].scene++;
      gameData[channelId].dicePool = gameData[channelId].scene;
      sendCandleStatus(message, 11 - gameData[channelId].scene);
      await startTruthsSystem(message, channelId); // Start the truths system
    }
  } else {
    gameData[channelId].diceLost = 0;
  }

  messageContent = `**${totalPlayerSixes > 0 ? `Success!` : `Failure.`}**\n`;
  messageContent += `You rolled (${rolls.length} dice${hopeDieEmoji ? ' + Hope die' : ''}): ${diceEmojis}${hopeDieEmoji ? ` + ${hopeDieEmoji}` : ''}\n`;
  messageContent += `GM rolled (${gmDiceCount} dice): ${gmDiceEmojis}\n`;

  messageContent += `${ones > 0 ? `${ones} di${ones === 1 ? 'e' : 'ce'} removed from the communal dice pool. ${gameData[channelId].dicePool - ones} di${gameData[channelId].dicePool - ones === 1 ? 'e remains' : 'ce remain'}.` : `${gameData[channelId].dicePool - ones} di${gameData[channelId].dicePool - ones === 1 ? 'e remains' : 'ce remain'}.`}\n`;
  gameData[channelId].dicePool -= ones;

  if (gmSixes >= totalPlayerSixes && gmDiceCount > 0) {
    messageContent += `<@${gameData[channelId].gmId}, the GM, wins narration rights for this conflict.`;
  } else {
    messageContent += `<@${message.author.id}>, the acting player, wins narration rights for this conflict.`;
  }

  message.channel.send({ content: messageContent, allowedMentions: { repliedUser: false } });
}

async function startTruthsSystem(message, channelId) {
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
    if (player) { //check if the player still exists.
      truthOrderMessage += `Truth ${i + 1}>: <@${speakerId}>${player.isDead ? " (Ghost)" : ""}\n`;
    }
    truthSpeakerIndex = (truthSpeakerIndex + 1) % playerOrder.length;
  }

  // Final Truth (Collective)
  const livingPlayers = playerOrder.filter(playerId => game.players[playerId] && !game.players[playerId].isDead);
  let finalTruthMessage = "";
  if (livingPlayers.length > 0) {
    finalTruthMessage = "All together: **And we are alive.**";
  }

  let fullMessage = `GM only: **These things are true. The world is dark.**\n\n`;

  if (truthOrderMessage) {
    fullMessage += `Establishing Truths order: ${truthOrderMessage}\n\n`;
  }

  fullMessage += `${finalTruthMessage}`;

  message.channel.send(fullMessage);

  // Reset dice lost.
  game.diceLost = 0;
  saveGameData();
}

async function slowType(channel, text, charDelay = 50, wordDelay = 500) {
  if (typeof text !== 'string' || text.trim() === '') {
    console.warn('slowType: Received empty or invalid text. Skipping slow typing.');
    return;
  }

  let currentMessage = '';
  const words = text.split(' ');
  const sentMessage = await channel.send('...'); // Send an initial message so we have something to edit

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    for (const char of word) {
      currentMessage += char;
      await sentMessage.edit(currentMessage);
      const randomCharDelay = charDelay + Math.floor(Math.random() * 50);
      await new Promise(resolve => setTimeout(resolve, randomCharDelay));
    }
    if (i < words.length - 1) {
      currentMessage += ' ';
      await sentMessage.edit(currentMessage);
      const randomWordDelay = wordDelay + Math.floor(Math.random() * 200);
      await new Promise(resolve => setTimeout(resolve, randomWordDelay));
    }
  }
}

async function playAudioFromUrl(url, voiceChannel) {
  try {
    if (!voiceChannel || voiceChannel.type !== ChannelType.GuildVoice) {
      console.error(`Invalid voice channel.`);
      return;
    }

    const connection = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId: voiceChannel.guild.id,
      adapterCreator: voiceChannel.guild.voiceAdapterCreator,
    });

    // Validate the URL
    if (!ytdl.validateURL(url)) {
      console.error(`Invalid URL: ${url}`);
      return;
    }

    //Check that the bot can play audio from this link.
    const stream = ytdl(url, { filter: 'audioonly' });

    //Create the Audio Player
    const player = createAudioPlayer();
    const resource = createAudioResource(stream);
    player.play(resource);
    connection.subscribe(player);

    //Listen for errors.
    player.on('error', error => {
      console.error('Error:', error.message);
    });

    return new Promise((resolve, reject) => {
      player.on(AudioPlayerStatus.Idle, () => {
        resolve();
      });

      player.on('error', (error) => {
        reject(error);
      });
    });
  } catch (error) {
    console.error('Error in playAudioFromUrl:', error);
  }
}

export async function playRecordings(message) {
  const channelId = message.channel.id;
  const game = gameData[channelId];
  const players = game.players;

  if (!game) {
    message.reply('No game is in progress in this channel.');
    return;
  }

  if (game.scene < 1) {
    message.reply('The game has not started yet. Use `.nextstep` to continue.');
    return;
  }

  message.channel.send('The final scene fades to black. The story is over. Your final recordings will now play.');

  message.channel.send('Playing final recordings:');

  let delay = 5000;

  const playerIds = Object.keys(players);

  async function playNextRecording(index) {
    if (index >= playerIds.length) {
      delete gameData[channelId];
      saveGameData();
      return;
    }

    const userId = playerIds[index];

    setTimeout(async () => {
      if (players[userId].recording) {
        if (game.gameMode === 'voice-plus-text') {
          // Handle voice+text mode logic
          const voiceChannelId = game.voiceChannelId;

          // Check if the bot is already in the voice channel
          const existingConnection = getVoiceConnection(message.guild.id);
          if (!existingConnection) {
            const voiceChannel = client.channels.cache.get(voiceChannelId);
            if (voiceChannel && voiceChannel.type === ChannelType.GuildVoice) {
              try {
                const connection = joinVoiceChannel({
                  channelId: voiceChannelId,
                  guildId: message.guild.id,
                  adapterCreator: message.guild.voiceAdapterCreator,
                });
                console.log(`Joined voice channel: ${voiceChannel.name}`);
              } catch (error) {
                console.error('Failed to join voice channel:', error);
                message.channel.send('Failed to join voice channel. Playing back in text only.');
                game.gameMode = "text-only";
              }
            } else {
              console.error(`Voice channel ${voiceChannelId} not found.`);
              message.channel.send('Voice channel not found. Playing back in text only.');
              game.gameMode = "text-only";
            }
          }

          if (players[userId].recording.startsWith('http')) {
            // It's an audio URL
            try {
              const voiceChannel = client.channels.cache.get(voiceChannelId);
              await playAudioFromUrl(players[userId].recording, voiceChannel);
              message.channel.send(`Recording for <@${userId}>: (Audio Played)`);
            } catch (error) {
              console.error(`Error playing audio recording for ${userId}:`, error);
              message.channel.send(`Error playing recording for <@${userId}>. Check console for details.`);
            }
          } else {
            message.channel.send(`Recording for <@${userId}>:\n*<@${userId}>'s final message...*`);
            slowType(message.channel, players[userId].recording); // Use slowType here!
          }
        } else {
          // Handle text-only mode logic
          if (players[userId].recording.startsWith('http')) {
            message.channel.send(`Recording for <@${userId}>:\n${players[userId].recording}`);
          } else {
            message.channel.send(`Recording for <@${userId}>:\n*<@${userId}>'s final message...*`);
            slowType(message.channel, players[userId].recording);
          }
        }
      } else {
        message.channel.send(`No playable recording for <@${userId}>.`);
      }

      await playNextRecording(index + 1);
    }, delay);

    delay = 3000;
  }

  await playNextRecording(0);
}


function assignRandomMoment(user, player) {
  player.moment = defaultMoments[Math.floor(Math.random() * defaultMoments.length)];
  user.send(`You timed out. A random Moment has been assigned: "${player.moment}"`);
}

export async function askPlayersForCharacterInfo(message, channelId) {
  const game = gameData[channelId];
  const playerIds = game.playerOrder;

  for (const playerId of playerIds) {
    try {
      const player = await message.guild.members.fetch(playerId);
      const user = player.user;

      // Ask for Name
      await askPlayerForCharacterInfoWithRetry(user, game, playerId, 'name', "What's your character's name or nickname?");

      // Ask for Look
      await askPlayerForCharacterInfoWithRetry(user, game, playerId, 'look', 'What does your character look like at a quick glance?');

      // Ask for Concept
      await askPlayerForCharacterInfoWithRetry(user, game, playerId, 'concept', 'Briefly, what is your character\'s concept (profession or role)?');

    } catch (error) {
      console.error(`Error requesting character info from player ${playerId}:`, error);
      message.channel.send(`Failed to get character info from player <@${playerId}>. Game cancelled.`);
      delete gameData[channelId];
      saveGameData();
      return;
    }
  }
}

async function askPlayerForCharacterInfoWithRetry(user, game, playerId, field, question, retryCount = 0) {
  try {
    const dmChannel = await user.createDM();
    await user.send(question);

    const filter = m => m.author.id === playerId;
    const collected = await dmChannel.awaitMessages({ filter, max: 1, time: 60000, errors: ['time'] });

    if (collected.size > 0) {
      const response = collected.first().content;
      game.players[playerId][field] = sanitizeString(response);
      saveGameData();
    } else {
      throw new Error(`Player <@${playerId}> timed out while providing ${field}.`);
    }
  } catch (error) {
    if (retryCount < 3) {
      await user.send(`You timed out. Please provide your ${field} again.`);
      await askPlayerForCharacterInfoWithRetry(user, game, playerId, field, question, retryCount + 1);
    } else {
      throw new Error(`Player <@${playerId}> timed out after multiple retries.`);
    }
  }
}

const numberWords = [
  "zero", "one", "two", "three", "four", "five",
  "six", "seven", "eight", "nine", "ten"
];

function numberToWords(number) {
  if (number >= 0 && number <= 10) {
    return numberWords[number];
  } else {
    return number.toString(); // Return the number as a string if it's outside the range 0-10
  }
}

export async function sendCandleStatus(message, litCandles) {
  if (litCandles === 10) {
    message.channel.send('***Ten Candles are lit.***');
  } else if (litCandles >= 1 && litCandles <= 9) {
    const words = numberToWords(litCandles);
    if (litCandles === 1) {
      message.channel.send(`***There is ${words} lit candle.***`);
    } else {
      message.channel.send(`***There are ${words} lit candles.***`);
    }
  } else {
    message.channel.send('***All candles have been extinguished.***');
  }
}

client.login(process.env.DISCORD_TOKEN);