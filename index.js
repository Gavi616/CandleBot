require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const Discord = require('discord.js');
const fs = require('fs');
const path = require('path');
const helpEmbed = require('./embed.js');

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
const isTesting = false;

let gameData = {};

function loadGameData() {
  try {
    const data = fs.readFileSync('gameData.json', 'utf8');
    gameData = JSON.parse(data);
    console.log('Game data loaded successfully:', gameData);
  } catch (err) {
    console.error('Error loading game data:', err);
    gameData = {};
    console.log('Game data created successfully:', gameData);
  }
}

function saveGameData() {
  try {
    for (const channelId in gameData) {
      gameData[channelId].lastSaved = new Date().toISOString();
    }
    fs.writeFileSync('gameData.json', JSON.stringify(gameData));
    console.log('Game data saved successfully:', gameData);
  } catch (err) {
    console.error('Error saving game data:', err);
  }
}

client.once('ready', () => {
  console.log('Ten Candles Bot is ready!');
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

  if (message.channel.type !== Discord.ChannelType.DM) {
    if (message.content.startsWith(prefix)) {
      const args = message.content.slice(prefix.length).trim().split(/ +/);
      const command = args.shift().toLowerCase();

      if (command === 'help') {
        console.log('Help command received.');
        message.channel.send({ embeds: [helpEmbed.help] });
        console.log('Help message sent.');
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
      }
    }
  } else { // DM logic
    if (gameData[Object.keys(gameData).find(key => gameData[key].players[userId])]) {
      const currentGame = gameData[Object.keys(gameData).find(key => gameData[key].players[userId])];
      if (currentGame.characterGenStep === 1) {
        const [virtue, vice] = message.content.split(',').map(s => s.trim());
        if (virtue && vice) {
          currentGame.players[userId].virtue = virtue;
          currentGame.players[userId].vice = vice;
          saveGameData();
          message.reply('Traits received!');
        } else {
          message.reply('Please provide both Virtue and Vice separated by a comma.');
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
    playerOrder: playerIds,
    gmId: gmId,
    gm: {
      consent: false,
      gmUsername: gm.user.username,
      theme: '',
      brink: '',
    },
  };

  for (const playerId of playerIds) {
    gameData[channelId].players[playerId] = {
      consent: false,
      playerUsername: message.guild.members.cache.get(playerId).user.username,
      virtue: '',
      vice: '',
      moment: '',
      brink: '',
      name: '',
      look: '',
      concept: '',
      recording: '',
    };
  }

  saveGameData();

  try {
    const dmChannel = await gm.user.createDM();

    await gm.user.send(`You have been designated as the GM for a Ten Candles game in ${message.guild.name}. Do you consent to participate? (yes/no) You have 60 seconds to respond.`);

    const filter = m => {
      const filterResult = m.author.id === gmId && m.content.toLowerCase() === 'yes';
      console.log(`Filter: Author ID: ${m.author.id}, Content: ${m.content}`);
      console.log(`Filter Result: ${filterResult}`);
      return filterResult;
    };
    const collected = await dmChannel.awaitMessages({ filter, max: 1, time: 60000, errors: ['time'] });

    console.log('Collected:', collected);

    if (collected.size > 0) {
      const response = collected.first().content;
      console.log(`DM Content: "${response}"`);
      const isConsent = response.toLowerCase() === 'yes';
      await gm.user.send(`Received: "${response}". Consent: ${isConsent ? 'Yes' : 'No'}`);

      gameData[channelId].gm.consent = isConsent;
    } else {
      gameData[channelId].gm.consent = false;
    }

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

  for (const playerId of playerIds) {
    try {
      const player = await message.guild.members.fetch(playerId);
      const user = player.user;

      if (user.bot) {
        message.channel.send(`Player <@${playerId}> is a bot and cannot be a player. Game cancelled.`);
        delete gameData[channelId];
        saveGameData();
        return;
      }

      if (isTesting) { // Bypass consent for players in testing mode
        gameData[channelId].players[playerId].consent = true;
        console.log(`Player <@${playerId}> consent bypassed in testing mode.`);
      } else {
        const dmChannel = await user.createDM();
        console.log(`Player ${playerId} DM Channel: Found`);

        await user.send(`You have been added as a player to a Ten Candles game in ${message.guild.name}. Do you consent to participate? (yes/no) You have 60 seconds to respond.`);

        const filter = m => {
          const filterResult = m.author.id === playerId && m.content.toLowerCase() === 'yes';
          console.log(`Filter: Author ID: ${m.author.id}, Content: ${m.content}`);
          console.log(`Filter Result: ${filterResult}`);
          return filterResult;
        };
        const collected = await dmChannel.awaitMessages({ filter, max: 1, time: 60000, errors: ['time'] });

        console.log('Collected:', collected);

        if (collected.size > 0) {
          const response = collected.first().content;
          console.log(`DM Content: "${response}"`);
          const isConsent = response.toLowerCase() === 'yes';
          await user.send(`Received: "${response}". Consent: ${isConsent ? 'Yes' : 'No'}`);

          gameData[channelId].players[playerId].consent = isConsent;
        } else {
          gameData[channelId].players[playerId].consent = false;
        }

        if (!gameData[channelId].players[playerId].consent) {
          message.channel.send(`Player <@${playerId}> did not consent. Game cancelled.`);
          delete gameData[channelId];
          saveGameData();
          return;
        }
      }
    } catch (error) {
      console.error(`Error requesting player ${playerId} consent:`, error);
      if (error.message === 'time') {
        message.channel.send(`Player <@${playerId}> consent timed out. Game cancelled.`);
      } else {
        message.channel.send(`Player <@${playerId}> consent failed. Please check the console for details. Game cancelled.`);
      }
      delete gameData[channelId];
      saveGameData();
      return;
    }
  }
  
  message.channel.send('A new Ten Candles game has started!\n\nLet\'s begin character generation.\nUse the `.nextstep` command to proceed.')
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
  const gm = message.guild.members.cache.get(game.gmId);
  const players = Object.values(game.players).map(player => message.guild.members.cache.get(Object.keys(game.players).find(key => game.players[key] === player)));

  const playerNames = players.map(player => player ? player.user.username : 'Unknown').join(', ');

  if (game.characterGenStep > 0) {
    message.reply(`Character Generation Step: ${game.characterGenStep}\nGM: ${gm.user.username}\nPlayers: ${playerNames}\nUse the \`.nextstep\` command to proceed.`);
  } else {
    message.reply(`Scene: ${game.scene}\nGM: ${gm.user.username}\nPlayers: ${playerNames}\nUse the appropriate command to proceed.`); // Replace with your scene-specific command
  }
}

async function sendCharacterGenStep(message, channelId) {
  const step = gameData[channelId].characterGenStep;
  const players = gameData[channelId].players;
  const playerOrder = gameData[channelId].playerOrder;
  const gmId = gameData[channelId].gmId;

  if (step === 1) {
    message.channel.send('\n**Step One: Players Write Traits (Light Three Candles)**\nPlayers, check your DMs and reply with a Virtue and a Vice.');
  } else if (step === 2) {
    const swappedTraits = swapTraits(players, playerOrder);
    gameData[channelId].players = swappedTraits;
    saveGameData();
    message.channel.send('**Step Two: GM Introduces the Module / Theme**\nTraits have been swapped (check your DMs and look over what you have received). The GM will now introduce the module/theme.');
  } else if (step === 3) {
    message.channel.send('**Step Three: Players Create Concepts**\nPlayers, check your DMs and respond with your character\'s Name, Look and Concept, in that order as three separate messages.');
  } else if (step === 4) {
    message.channel.send('**Step Four: Players Plan Moments (Light Three Candles)**\nAn event that would be reasonable to achieve, and kept succinct and clear to provide strong direction. However, all Moments should also have the potential for failure.\nPlayers, please DM me your Moment.');
  } else if (step === 5) {
    message.channel.send('**Step Five: Players and GM Discover Brinks (Light Three Candles)**\nCheck your DMs for personalized instructions on this step. You have five minutes to respond.');

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
        dmCollectors.push(user.dmChannel.awaitMessages({ filter, max: 1, time: 300000 })); // 5 minutes
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
          players[playerId].brink = brinkResponses[nextPlayerId] || "No Brink was given";
        }
      }
      players[threatPlayerId].brink = brinkResponses[threatPlayerId] || "No Brink was given";

      saveGameData();
      gameData[channelId].characterGenStep++;
      sendCharacterGenStep(message, channelId);
    }
  } else if (step === 6) {
    const swappedBrinks = swapBrinks(players, playerOrder, gmId);
    gameData[channelId].players = swappedBrinks;
    saveGameData();
    message.channel.send('**Step Six: Brinks Swapped**\nBrinks have been swapped. Players may now arrange their Trait, Moment, and Brink cards. They may place one moment on top.');
  } else if (step === 7) {
    message.channel.send('**Step Seven: Inventory Supplies (Light the Final Candle)**\nYour character has whatever items you have in your pockets (or follow your GM\'s instructions, if provided). It begins.');
  } else if (step === 8) {
    message.channel.send('**Step 8: Game Start**\nCharacter generation is complete! The first candle is lit, and the game begins.\nUse the `.action` command to perform actions. Use modifiers such as `-trait`, `-moment`, `-brink` and `-hope` as needed. Expect the candles to begin to go out as the scenes progress.\nCheck your DMs for instructions on recording your final message.');
    gameData[channelId].dicePool = 10;
    gameData[channelId].scene = 1;
    saveGameData();
    sendCandleStatus(message, gameData);

    const players = gameData[channelId].players;
    for (const userId in players) {
      try {
        client.users.cache.get(userId).send('Please record your final message for the world you will inevitably leave behind in-character and send it as an audio file or a text message.');
      } catch (error) {
        console.error(`Error DMing user ${userId}:`, error);
      }
    }
  }
}

function swapTraits(players, playerOrder) {
  const newPlayers = { ...players };
  for (let i = 0; i < playerOrder.length; i++) {
    const currentPlayerId = playerOrder[i];
    const nextPlayerId = playerOrder[(i + 1) % playerOrder.length];
    const prevPlayerId = playerOrder[(i - 1 + playerOrder.length) % playerOrder.length];

    newPlayers[currentPlayerId].virtue = players[prevPlayerId].virtue;
    newPlayers[currentPlayerId].vice = players[nextPlayerId].vice;
  }
  return newPlayers;
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
    message.reply('Character generation is already complete.');
    return;
  }

  gameData[channelId].characterGenStep++;
  saveGameData();
  sendCharacterGenStep(message, channelId);
}

async function action(message, args) {
  const channelId = message.channel.id;
  if (!gameData[channelId]) {
    message.reply('No game is in progress in this channel. Use `.startgame` to begin.');
    return;
  }
  if (gameData[channelId].characterGenStep < 8) {
    message.reply('Character generation is not complete. Please use the `.nextstep` command to proceed.');
    return;
  }

  let dicePool = gameData[channelId].dicePool;
  let hopeDieRoll = 0;
  let rerollOnes = false;
  let numOnesRerolled = 0;

  if (args.includes('-trait')) {
    rerollOnes = true;
  }

  if (args.includes('-moment')) {
  }

  if (args.includes('-brink')) {
    rerollOnes = true;
  }

  if (args.includes('-hope') && gameData[channelId].hopeDieActive) {
    hopeDieRoll = Math.floor(Math.random() * 6) + 1;
  }

  let rolls = [];
  if (hopeDieRoll) {
    rolls.push(hopeDieRoll);
  }

  for (let i = 0; i < dicePool; i++) {
    rolls.push(Math.floor(Math.random() * 6) + 1);
  }

  let sixes = rolls.filter((roll) => roll >= 6).length;
  let ones = rolls.filter((roll) => roll === 1).length;

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
    ones = rolls.filter((roll) => roll === 1).length;
  }

  gameData[channelId].dicePool -= rolls.length - (hopeDieRoll ? 1 : 0);

  let response = `Rolled: ${rolls.join(', ')}\n`;
  if (sixes > 0) {
    response += `Success! (${sixes} sixes)\n`;
  } else {
    response += `Failure. (No sixes)\n`;
  }
  response += `Dice remaining: ${gameData[channelId].dicePool}`;

  let gmDicePool = 10 - gameData[channelId].scene;
  let gmRolls = [];
  for (let i = 0; i < gmDicePool; i++) {
    gmRolls.push(Math.floor(Math.random() * 6) + 1);
  }
  let gmSixes = gmRolls.filter((roll) => roll === 6).length;

  let totalSixes = sixes;
  if (hopeDieRoll > 0 && hopeDieRoll >= 5) {
    totalSixes++;
  }

  let narrationRights = '';
  if (totalSixes > gmSixes) {
    narrationRights = 'You have narration rights.';
  } else if (totalSixes < gmSixes) {
    narrationRights = 'The GM has narration rights.';
  } else {
    narrationRights = 'The GM has narration rights.';
  }

  response += `\nGM Rolled: <span class="math-inline">\{gmRolls\.join\(', '\)\} \(</span>{gmSixes} sixes)\n${narrationRights}`;

  if (gameData[channelId].scene === 10 && dicePool === 1) {
    if (ones > 0) {
      gameData[channelId].dicePool++;
    }
    if (sixes === 0) {
      response += '\nYour character will perish during this action, please narrate their demise.';
      delete gameData[channelId];
      saveGameData();
      message.channel.send(response);
      return;
    }
  }

  if (args.includes('-moment')) {
    if (sixes > 0) {
      response += '\nBurn your Moment card and give yourself a Hope die until your Brink fails.';
      gameData[channelId].hopeDieActive = true;
    } else {
      response += '\nBurn your Moment card and face your imminent doom.';
      gameData[channelId].hopeDieActive = false;
    }
  }

  if (gameData[channelId].dicePool <= 0) {
    gameData[channelId].dicePool = 10 - gameData[channelId].scene;
    gameData[channelId].scene++;
    response += `\nScene changed to scene ${gameData[channelId].scene}. Dice pool reset to ${gameData[channelId].dicePool}`;
    if (gameData[channelId].scene > 10) {
      response += '\nThe final candle is extinguished, any remaining characters may take their final actions now. Use `.playrecordings` when the last character has perished.';
    } else {
      response += "\nEstablish truths equal to the number of lit candles, then say 'and we are alive.'";
    }
  }

  saveGameData();

  sendDiceImages(message, rolls);
  message.channel.send(response);
  sendCandleStatus(message, gameData);

  if (args.includes('-trait') && numOnesRerolled > 0) {
    message.channel.send(`Burn your Trait card, ${numOnesRerolled} ones have been rerolled.`);
  }

  if (args.includes('-brink') && numOnesRerolled > 0) {
    message.channel.send(`Burn your Brink card, ${numOnesRerolled} ones have been rerolled.`);
  }
}

async function playRecordings(message) { // Renamed from endGame
  const channelId = message.channel.id;
  if (!gameData[channelId]) {
    message.reply('No game is in progress in this channel.');
    return;
  }

  const players = gameData[channelId].players;

  client.on('messageCreate', async (dmMessage) => {
    if (dmMessage.channel.type === Discord.ChannelType.DM && players[dmMessage.author.id]) {
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
  for (const userId in players) {
    if (players[userId].recording) {
      if (players[userId].recording.startsWith('http')) {
        message.channel.send(`Recording for <@${userId}>:\n${players[userId].recording}`);
      } else {
        message.channel.send(`Recording for <@${userId}>:\n"${players[userId].recording}"`);
        message.channel.send(`*<@${userId}>'s final message read aloud:*`);
        message.channel.send(players[userId].recording);
      }
    } else {
      message.channel.send(`No recording for <@${userId}>.`);
    }
  }

  delete gameData[channelId];
  saveGameData();
}

async function askPlayersForCharacterInfo(message, channelId) {
  const game = gameData[channelId];
  const playerIds = game.playerOrder;

  for (const playerId of playerIds) {
    try {
      const player = await message.guild.members.fetch(playerId); // Fetch the member
      const user = player.user; // Get the user object

      // Ask for Name
      await askPlayerForCharacterInfoWithRetry(user, game, playerId, 'name', "What's their name or what are they called?");

      // Ask for Look
      await askPlayerForCharacterInfoWithRetry(user, game, playerId, 'look', 'What do they look like at a quick glance?');

      // Ask for Concept
      await askPlayerForCharacterInfoWithRetry(user, game, playerId, 'concept', 'In a few words, who are they?');

    } catch (error) {
      console.error(`Error requesting character info from player ${playerId}:`, error);
      message.channel.send(`Failed to get character info from player <@${playerId}>. Game cancelled.`);
      delete gameData[channelId];
      saveGameData();
      return;
    }
  }
}

async function askPlayerForCharacterInfoWithRetry(user, game, playerId, field, question, retryCount = 0) { // changed from player to user
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

async function sendDiceImages(message, rolls) {
  for (const roll of rolls) {
    const imagePath = path.join(__dirname, `images/dice_${roll}.png`);
    try {
      await message.channel.send({ files: [imagePath] });
    } catch (error) {
      console.error('Error sending dice image:', error);
    }
  }
}

async function sendCandleStatus(message, gameData) {
  const channelId = message.channel.id;
  if (!gameData[channelId]) return;

  const scene = gameData[channelId].scene;

  for (let i = 10; i >= 1; i--) {
    let imagePath;
    if (i >= scene) {
      imagePath = path.join(__dirname, 'images/lit_candle.gif');
    } else {
      imagePath = path.join(__dirname, 'images/unlit_candle.gif');
    }
    try {
      await message.channel.send({ files: [imagePath] });
    } catch (error) {
      console.error('Error sending candle image:', error);
    }
  }
}

client.login(process.env.DISCORD_TOKEN);