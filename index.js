import 'dotenv/config';
import { Client, GatewayIntentBits, EmbedBuilder, ChannelType } from 'discord.js';
import fs from 'fs';
//import path from 'path';
//import { fileURLToPath } from 'url';
import { helpEmbed } from './embed.js';

const client = new Client({
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
const version = '0.8.9';
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

  if (message.channel.type !== ChannelType.DM) {
    if (message.content.startsWith(prefix)) {
      const args = message.content.slice(prefix.length).trim().split(/ +/);
      const command = args.shift().toLowerCase();

      if (command === 'help') {
        message.channel.send({ embeds: [helpEmbed.help] });
      } else if (command === 'startgame') {
        startGame(message);
      } else if (command === 'action') {
        action(message, args);
      } else if (command === 'playrecordings') {
        playRecordings(message);
      } else if (command === 'nextstep') {
        nextStep(message);
      } else if (command === 'gamestatus') {
        gameStatus(message);
      } else if (command === 'cancelgame') {
        cancelGame(message);
      }
    }
  } else {
    if (gameData[Object.keys(gameData).find(key => gameData[key].players[userId])]) {
      const currentGame = gameData[Object.keys(gameData).find(key => gameData[key].players[userId])];
      if (currentGame.characterGenStep === 1) {
        const [virtue, vice] = message.content.split(',').map(s => s.trim());
        if (virtue && vice) {
          currentGame.players[userId].virtue = virtue;
          currentGame.players[userId].vice = vice;
          saveGameData();
          message.reply('Traits received!');
        }
      } else if (currentGame.characterGenStep === 4) {
        currentGame.players[userId].moment = message.content;
        saveGameData();
        message.reply('Moment received!');
      } else if (currentGame.characterGenStep === 5) {
        currentGame.players[userId].brink = message.content;
        saveGameData();
        message.reply('Brink received!');
      } else if (gameData[channelId] && currentGame.characterGenStep === 8 && message.attachments.size === 0 && message.content.startsWith(prefix) === false) {
        if (message.attachments.size > 0 && message.attachments.first().contentType.startsWith('audio/')) {
          currentGame.players[message.author.id].recording = message.attachments.first().url;
          saveGameData();
          message.reply('Audio recording received!');
        } else if (message.content) {
          currentGame.players[message.author.id].recording = message.content;
          saveGameData();
          message.reply('Text recording received!');
        }
      }
    }
  }
});

async function startGame(message) {
  const channelId = message.channel.id;
  const args = message.content.split(' ').slice(1);

  if (gameData[channelId]) {
    message.reply('A game is already in progress in this channel.');
    return;
  }

  if (args.length < 2) {
    message.reply('Usage: .startgame <GM ID> <Player IDs (space-separated)>');
    return;
  }

  const gmId = args[0].replace(/<@!?(\d+)>/, '$1');
  const playerIds = args.slice(1).map(id => id.replace(/<@!?(\d+)>/, '$1'));

  if (playerIds.length < 2 || playerIds.length > 10) {
    message.reply('A game requires a GM and at least 2 players (to a maximum of 10 players). No game was started.');
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
  for (const playerId of playerIds) {
    const player = message.guild.members.cache.get(playerId);
    if (player.presence?.status === 'offline') {
      message.reply(`Player <@${playerId}> must be online to start a game. No game was started.`);
      return;
    }
  }

  gameData[channelId] = {
    dicePool: -1,
    scene: 0,
    characterGenStep: 1,
    players: {},
    diceLost: 0,
    playerOrder: playerIds,
    gmId: gmId,
    gm: {
      consent: false,
      gmUsername: gm.user.username,
      brink: '',
    },
  };

  for (const playerId of playerIds) {
    gameData[channelId].players[playerId] = {
      consent: false,
      playerUsername: message.guild.members.cache.get(playerId).user.username,
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
    };
  }

  saveGameData();

  // GM Consent
  try {
    const gm = message.guild.members.cache.get(gmId);
    const dmChannel = await gm.user.createDM();
    await gm.user.send(`You have been designated as the GM for a Ten Candles game in ${message.guild.name}. Do you consent to participate? (yes/no) You have 60 seconds to respond.`);

    const filter = m => m.author.id === gmId && m.content.toLowerCase() === 'yes';
    const collected = await dmChannel.awaitMessages({ filter, max: 1, time: 60000, errors: ['time'] });

    gameData[channelId].gm.consent = collected.size > 0 && collected.first().content.toLowerCase() === 'yes';

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
      await user.send(`You have been added as a player to a Ten Candles game in ${message.guild.name}. Do you consent to participate? (yes/no) You have 60 seconds to respond.`);

      const filter = m => m.author.id === playerId && m.content.toLowerCase() === 'yes';
      const collected = await dmChannel.awaitMessages({ filter, max: 1, time: 60000, errors: ['time'] });

      gameData[channelId].players[playerId].consent = collected.size > 0 && collected.first().content.toLowerCase() === 'yes';

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

  message.channel.send('**The World of Ten Candles**\n' +
    'Your characters will face unimaginable terrors in the dying of the light.\n\n' +
    '**Though you know your characters will die, you must have hope that they will survive.**\n\n' +
    '**Ten Candles** focuses around shared narrative control.\n' +
    'Everyone will share the mantle of storyteller and have an equal hand in telling this dark story.\n\n' +
    'Let\'s begin character generation.\nUse the `.nextstep` command to proceed.')
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
    : `Scene: ${game.scene}\nGM: ${gmMention}\nPlayers: ${playerMentions}\nUse the \`.action\` command to take action and move the game forward.`;

  message.channel.send({
    content: content,
    allowedMentions: {
      parse: [], // Disallow parsing of mentions (no beep / notification)
    },
  });
}

async function cancelGame(message) {
  const channelId = message.channel.id;
  const game = gameData[channelId];

  if (!game) {
    message.reply('No game is in progress in this channel.');
    return;
  }

  const gmId = game.gmId;
  const gm = message.guild.members.cache.get(gmId);

  try {
    const dmChannel = await gm.user.createDM();
    await gm.user.send(`Are you sure you want to cancel the game in ${message.channel.name}? (yes/no) You have 60 seconds to respond.`);

    const filter = m => m.author.id === gmId && ['yes', 'no'].includes(m.content.toLowerCase());
    const collected = await dmChannel.awaitMessages({ filter, max: 1, time: 60000, errors: ['time'] });

    if (collected.size > 0) {
      const response = collected.first().content.toLowerCase();
      if (response === 'yes') {
        delete gameData[channelId];
        saveGameData();
        message.channel.send(`Game in ${message.channel.name} has been cancelled by the GM.`);
      } else {
        message.channel.send('Game cancellation was aborted by GM.');
      }
    } else {
      message.channel.send(`Game in ${message.channel.name} cancellation timed out. Game not cancelled.`);
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

async function sendCharacterGenStep(message, channelId) {
  const step = gameData[channelId].characterGenStep;
  const players = gameData[channelId].players;
  const playerOrder = gameData[channelId].playerOrder;
  const gmId = gameData[channelId].gmId;

  if (step === 1) {
    message.channel.send('\n**Step One: Players Write Traits (light three candles)**\nPlayers, check your DMs and reply with a Virtue and a Vice.\nYou have 5 minutes to complete this step.');
    sendCandleStatus(message, 3);

    const traitPromises = playerOrder.map(async (playerId) => {
      try {
        const player = await message.guild.members.fetch(playerId);
        const user = player.user;
        const dmChannel = await user.createDM();
        await user.send('Please provide your Virtue and Vice, separated by a comma (e.g., "Courageous, Greedy").');

        const filter = m => m.author.id === playerId;
        const collected = await dmChannel.awaitMessages({ filter, max: 1, time: 300000, errors: ['time'] }); // 5 minutes

        if (collected.size > 0) {
          const [virtue, vice] = collected.first().content.split(',').map(s => s.trim());
          if (virtue && vice) {
            players[playerId].virtue = virtue;
            players[playerId].vice = vice;
          } else {
            assignRandomTraits(user, players[playerId]);
          }
        } else {
          assignRandomTraits(user, players[playerId]);
        }
      } catch (error) {
        console.error(`Error handling Virtue and Vice for player ${playerId}:`, error);
        assignRandomTraits(user, players[playerId]);
      }
    });
    await Promise.all(traitPromises);
    saveGameData();

  } else if (step === 2) {
    const swappedTraits = swapTraits(players, gameData[channelId], message.guild);
    gameData[channelId].players = swappedTraits;
    saveGameData();
    message.channel.send('**Step Two: GM Introduces the Module / Theme**\nTraits have been swapped (check your DMs and look over what you have received). Write your Virtue and Vice on two index cards. The GM will now introduce the module/theme. Use `.nextstep` when you are ready to continue.');
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

    // Collect Brink responses
    const brinkResponses = {};
    const collectedMessages = []; // Store collected messages
    const filter = m => {
      if (m.author.id === gmId) {
        return true;
      }
      return playerOrder.includes(m.author.id);
    };

    const dmCollectors = [];

    // Create DM collectors for each user
    for (const userId of [gmId, ...playerOrder]) {
      const user = client.users.cache.get(userId);
      if (user && user.dmChannel) {
        dmCollectors.push(user.dmChannel.awaitMessages({ filter, max: 1, time: 300000 }));
      } else {
        console.error(`Could not create DM collector for user ${userId}`);
      }
    }

    try {
      const results = await Promise.all(dmCollectors);
      results.forEach(collected => {
        if (collected.size > 0) {
          const message = collected.first();
          brinkResponses[message.author.id] = message.content;
          collectedMessages.push(message);
        }
      });

      // Distribute Brinks
      for (const playerId of playerOrder) {
        if (playerId === threatPlayerId) {
          gameData[channelId].gm.brink = brinkResponses[gmId];
        } else {
          const nextPlayerId = playerOrder[(playerOrder.indexOf(playerId) + 1) % playerOrder.length];
          players[playerId].brink = brinkResponses[nextPlayerId];
        }
      }
      players[threatPlayerId].brink = brinkResponses[threatPlayerId];

      saveGameData();
      message.channel.send('Brinks have been distributed. Proceeding to the next step.');
      gameData[channelId].characterGenStep++;
      sendCharacterGenStep(message, channelId);

    } catch (error) {
      console.error('Error collecting Brink responses:', error);
      message.channel.send('Brink collection timed out. Proceeding to the next step with available data.');

      // Distribute available Brinks
      for (const playerId of playerOrder) {
        if (playerId === threatPlayerId) {
          gameData[channelId].gm.brink = brinkResponses[gmId] || "No Brink was given";
        } else {
          const nextPlayerId = playerOrder[(playerOrder.indexOf(playerId) + 1) % playerOrder.length];
          players[playerId].brink = brinkResponses[nextPlayerId] || "No Brink was given, continuing..";
        }
      }
      players[threatPlayerId].brink = brinkResponses[threatPlayerId] || "No Brink was given, continuing..";

      saveGameData();
      gameData[channelId].characterGenStep++;
      sendCharacterGenStep(message, channelId);
    }
  } else if (step === 6) {
    const swappedBrinks = swapBrinks(players, playerOrder, gmId);
    gameData[channelId].players = swappedBrinks;
    saveGameData();
    message.channel.send('**Step Six: Arrange Traits**\nPlayers should now arrange their Traits, Moment, and Brink cards. Your Brink must go on the bottom of the stack, face down.');

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

    client.on('messageCreate', async (dmMessage) => {
      if (dmMessage.channel.type === ChannelType.DM && players[dmMessage.author.id]) {
        if (dmMessage.attachments.size > 0 && dmMessage.attachments.first().contentType.startsWith('audio/')) {
          players[dmMessage.author.id].recording = dmMessage.attachments.first().url;
          saveGameData();
          dmMessage.channel.send('Your audio recording was received!');
          recordingsReceived++;
        } else if (dmMessage.content) {
          players[dmMessage.author.id].recording = dmMessage.content;
          saveGameData();
          dmMessage.channel.send('Your text message was received!');
          recordingsReceived++;
        }

        if (recordingsReceived === Object.keys(players).length) {
          message.channel.send('All final recordings were received! Proceeding to start the game.');
          gameData[channelId].characterGenStep = 9;
          saveGameData();
          setTimeout(() => {
            sendCharacterGenStep(message, channelId);
          }, 5000);
        }
      }
    });

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
      '**How to Use `.action`:**\n' +
      'Use the `.action` command to perform actions. Use modifiers such as `-burnvirtue`, `-burnvice`, `-burnmoment` and `-brink` as needed.\n' +
      'Buring a Virtue or Vice from the top of your stack allows your `.action` to reroll all ones.\n' +
      'Buring your Moment from the top of your stack will give you a valuable Hope die is the `.action` succeeds!\n' +
      'Example(s): `.action` or `.action -burnvice`\n\n' +
      'Candles will be extinguished as the scenes progress.\n\n' +
      '**When to Use `.playrecordings`:**\n' +
      'Once all Player Characters have perished, the GM should use the `.playrecordings` command to play their final messages and close the game session.'
    );
    gameData[channelId].dicePool = 10;
    gameData[channelId].scene = 1;
    saveGameData();
    sendCandleStatus(message, gameData);
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

function nextStep(message) {
  const channelId = message.channel.id;
  if (!gameData[channelId]) {
    message.reply('No game is in progress in this channel.');
    return;
  }

  if (gameData[channelId].characterGenStep >= 8) {
    message.reply('Character generation is already complete. Use `.action` to continue the game.');
    return;
  }

  gameData[channelId].characterGenStep++;
  saveGameData();
  sendCharacterGenStep(message, channelId);
}

async function action(message, args) {
  const channelId = message.channel.id;
  const playerId = message.author.id;
  const playerNumericId = parseInt(playerId);

  if (!gameData[channelId]) {
    message.reply('No game is in progress in this channel. Use `.startgame` to begin.');
    return;
  }

  if (!gameData[channelId].players || !gameData[channelId].players[playerNumericId]) {
    console.log(`User "${message.author.username}" (ID: ${playerId}) tried to use .action but is not a player.`);
    return;
  }

  if (!gameData[channelId].players) {
    gameData[channelId].players = {};
  }

  if (!gameData[channelId].players[playerId]) {
    gameData[channelId].players[playerId] = { hopeDieActive: false };
  }

  if (gameData[channelId].characterGenStep < 8) {
    message.reply('Character generation is not complete. Please use `.nextstep` to proceed.');
    return;
  }

  let dicePool = gameData[channelId].dicePool;
  let hopeDieRoll = 0;
  let rerollOnes = false;

  let useMoment = false;
  let useVirtue = false;
  let useVice = false;
  let useBrink = false;

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

  if (args.includes('-brink')) {
    useBrink = true;
    if (gameData[channelId].players[playerNumericId].hopeDieActive) {
      message.channel.send(`<@${playerId}>, you are embracing your Brink. If this roll fails, you will lose your Hope die.`);
    }
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

  for (let i = 0; i < dicePool; i++) {
    rolls.push(Math.floor(Math.random() * 6) + 1);
  }

  let sixes = rolls.filter((roll) => roll >= 6).length;

  let ones = rolls.filter((roll, index) => roll === 1 && (hopeDieRoll !== 1 || index !== 0)).length;

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

    sixes = rolls.filter((roll) => roll >= 6).length;
    ones = rolls.filter((roll, index) => roll === 1 && (hopeDieRoll !== 1 || index !== 0)).length;
  }

  let playerRolls = rolls.filter((roll, index) => hopeDieRoll === 0 || index !== 0);

  let diceEmojis = playerRolls.map(roll => {
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

  let hopeDieEmoji = hopeDieRoll > 0 ? (() => {
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

  const gmDiceCount = gameData[channelId].scene - 1;
  const gmRolls = [];
  let gmSixes = 0;
  for (let i = 0; i < gmDiceCount; i++) {
    const roll = Math.floor(Math.random() * 6) + 1;
    gmRolls.push(roll);
    if (roll >= 6) {
      gmSixes++;
    }
  }

  let gmDiceEmojis = gmRolls.map(roll => {
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

  let totalSixes = sixes;
  if (hopeDieRoll >= 5) {
    totalSixes++;
  }

  // Moment success check
  if (useMoment && totalSixes > 0) {
    gameData[channelId].players[playerNumericId].hopeDieActive = true;
    message.channel.send(`<@${playerId}> has successfully achieved their Moment and gains a Hope die for future rolls.`);
  } else if (useMoment && totalSixes === 0) {
    gameData[channelId].players[playerNumericId].hopeDieActive = false;
    message.channel.send(`<@${playerId}> has failed to live their Moment and cannot gain a Hope die.`);
  }

  // Brink messages
  if (useBrink) {
    message.channel.send(`<@${playerId}> embraces their Brink!`);
  }

  if (totalSixes === 0) {
    // Failed Roll - Brink Reminder
    if (gameData[channelId].players[playerNumericId].momentBurned &&
      gameData[channelId].players[playerNumericId].virtueBurned &&
      gameData[channelId].players[playerNumericId].viceBurned) {
      message.channel.send(`<@${playerId}>, you have failed this roll. You can embrace your Brink to reroll all dice.`);
    }
    gameData[channelId].diceLost = ones;
  } else {
    gameData[channelId].diceLost = 0;
  }

  // Hope Die Loss Check
  if (useBrink && totalSixes === 0 && gameData[channelId].players[playerNumericId].hopeDieActive) {
    gameData[channelId].players[playerNumericId].hopeDieActive = false;
    message.channel.send(`<@${playerId}>, you have failed your Brink roll and lost your Hope die.`);
  }

  let messageContent = `**${totalSixes > 0 ? `Success!` : `Failure.`}**\n`;
  messageContent += `You rolled (${playerRolls.length} dice${hopeDieEmoji ? ' + Hope die' : ''}): ${diceEmojis}${hopeDieEmoji ? ` + ${hopeDieEmoji}` : ''}\n`;
  messageContent += `GM rolled (${gmDiceCount} dice): ${gmDiceEmojis}\n`;

  let remainingDice = gameData[channelId].dicePool - ones;

  if (remainingDice <= 0) {
    messageContent += "A candle will be extinguished ending the scene after this action is narrated.\n";
    gameData[channelId].scene++;
    gameData[channelId].dicePool = gameData[channelId].scene;
    sendCandleStatus(message, 11 - gameData[channelId].scene);
  } else {
    messageContent += `${ones > 0 ? `${ones} di${ones === 1 ? 'e' : 'ce'} removed from the communal dice pool. ${remainingDice} di${remainingDice === 1 ? 'e remains' : 'ce remain'}.` : `${remainingDice} di${remainingDice === 1 ? 'e remains' : 'ce remain'}.`}\n`;
    gameData[channelId].dicePool = remainingDice;
  }

  if (gmSixes >= totalSixes && gmDiceCount > 0) {
    messageContent += `<@${gameData[channelId].gmUserId}, the GM, narrates this action.`;
  } else {
    messageContent += `<@${message.author.id}>, the acting player, narrates this action.`;
  }

  message.channel.send({ content: messageContent, allowedMentions: { repliedUser: false } });
}

async function playRecordings(message) {
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

  client.on('messageCreate', async (dmMessage) => {
    if (dmMessage.channel.type === ChannelType.DM && players[dmMessage.author.id]) {
      if (dmMessage.attachments.size > 0 && dmMessage.attachments.first().contentType.startsWith('audio/')) {
        players[dmMessage.author.id].recording = dmMessage.attachments.first().url;
        saveGameData();
        dmMessage.channel.send('Audio recording received!');
      } else if (dmMessage.content) {
        players[dmMessage.author.id].recording = dmMessage.content;
        saveGameData();
        dmMessage.channel.send('Text recording received!');
      }
    }
  });

  message.channel.send('The final scene fades to black. The story is over. Your final recordings will now play.');

  message.channel.send('Playing final recordings:');

  let delay = 5000;

  const playerIds = Object.keys(players);

  function playNextRecording(index) {
    if (index >= playerIds.length) {
      delete gameData[channelId];
      saveGameData();
      return;
    }

    const userId = playerIds[index];

    setTimeout(() => {
      if (players[userId].recording) {
        if (players[userId].recording.startsWith('http')) {
          message.channel.send(`Recording for <@${userId}>:\n${players[userId].recording}`);
        } else {
          message.channel.send(`Recording for <@${userId}>:\n"${players[userId].recording}"`);
          message.channel.send(`*<@${userId}>'s final message read aloud:*`);
          message.channel.send(players[userId].recording);
        }
      } else {
        message.channel.send(`No playable recording for <@${userId}>.`);
      }

      playNextRecording(index + 1);
    }, delay);

    delay = 3000;
  }

  playNextRecording(0);
}

function assignRandomMoment(user, player) {
  player.moment = defaultMoments[Math.floor(Math.random() * defaultMoments.length)];
  user.send(`You timed out. A random Moment has been assigned: "${player.moment}"`);
}

async function askPlayersForCharacterInfo(message, channelId) {
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
      game.players[playerId][field] = response;
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

async function sendCandleStatus(message, litCandles) {
  if (litCandles > 0) {
    message.channel.send(`There are ${litCandles} lit candle${litCandles === 1 ? '' : 's'}.`);
  } else {
    message.channel.send('All candles have been extinguished.');
  }
}

client.login(process.env.DISCORD_TOKEN);