require('dotenv').config();
const Discord = require('discord.js');
const fs = require('fs');
const path = require('path');
const helpEmbed = require('./embed.js');

const client = new Discord.Client({ intents: ['Guilds', 'GuildMessages', 'MessageContent'] });
const prefix = '.';

let gameData = {};

function loadGameData() {
  try {
      const data = fs.readFileSync('gameData.json', 'utf8');
      gameData = JSON.parse(data);
      console.log('Game data loaded successfully:', gameData);
  } catch (err) {
      console.error('Error loading game data:', err);
      gameData = {};
  }
}

function saveGameData() {
  try {
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
  console.log('Message received:', message.content);
  if (message.author.bot) return;

  const channelId = message.channel.id;
  const userId = message.author.id;

  if (message.channel.type !== Discord.ChannelType.DM) { // Check if it's not a DM
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
      } else if (command === 'endgame') {
        endGame(message);
      } else if (command === 'nextstep') {
        nextStep(message);
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

function startGame(message) {
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

  gameData[channelId] = {
    dicePool: 0,
    scene: 0,
    traitsUsed: 0,
    momentUsed: false,
    brinkUsed: false,
    hopeDieActive: false,
    characterGenStep: 1,
    players: {},
    playerOrder: playerIds,
    gmId: gmId,
  };

  playerIds.forEach(id => {
    gameData[channelId].players[id] = {
      virtue: '',
      vice: '',
      moment: '',
      brink: '',
      name: '',
      look: '',
      concept: '',
      recording: '',
    };
  });

  saveGameData();
  message.channel.send('A new Ten Candles game has started! Let\'s begin character generation.');
  sendCharacterGenStep(message, channelId);
}

function sendCharacterGenStep(message, channelId) {
  const step = gameData[channelId].characterGenStep;
  const players = gameData[channelId].players;
  const playerOrder = gameData[channelId].playerOrder;
  const gmId = gameData[channelId].gmId;

  if (step === 1) {
    message.channel.send('**Step One: Players Write Traits (Light Three Candles)**\nEach player generates one Virtue and one Vice: Virtues solve more problems than they create, Vices cause more problems than they solve.\nThey should be a single vague but descriptive adjective. (e.g. Steady is better than Sharpshooter)\nPlayers, please DM me your Virtue and Vice, in that order, separated by a comma (e.g., "Brave, Cruel").');
  } else if (step === 2) {
    const swappedTraits = swapTraits(players, playerOrder);
    gameData[channelId].players = swappedTraits;
    saveGameData();
    message.channel.send('**Step Two: GM Introduces the Module / Theme**\nTraits have been swapped (check your DMs and look over what you have received). The GM will now introduce the module/theme.');
  } else if (step === 3) {
    message.channel.send('**Step Three: Players Create Concepts**\nName: What’s their name or what are they called?\nLook: What do they look like at a quick glance?\nConcept: In a few words, who are they?\nPlayers, please DM me your Name, Look and Concept, in that order as three separate messages\n(e.g., Luke Brooks[enter]\nA tall, handsome and svelte blonde man who wears brand-new cowboy-style clothing.[enter]\nA model who deperately wants to be seen as tough and rugged.[enter]"');
  } else if (step === 4) {
    message.channel.send('**Step Four: Players Plan Moments (Light Three Candles)**\nAn event that would be reasonable to achieve, and kept succinct and clear to provide strong direction. However, all Moments should also have the potential for failure.\nPlayers, please DM me your Moment.');
  } else if (step === 5) {
    message.channel.send('**Step Five: Players and GM Discover Brinks (Light Three Candles)**\nWrite a short explanation outlining when or where you saw your neighbor’s Brink (GM is included). A short descriptive phrase is fine, don’t worry about making them too specific.\nOne party, chosen at random, writes, “I have seen them..” & gives a detail about the threat without outright identifying them.\nPlayers, please DM me a short explanation of when or where you saw the Brink of the player to your right.\nGM, please DM me a short explanation of when or where you saw the Brink of the player to your right.');
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
      response += '\nYour character has perished. Please narrate their demise.';
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
      response += '\nThe final candle is extinguished, any remaining characters may take their final actions now. Use `.endgame` when the last character has perished.';
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

async function endGame(message) {
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

  message.channel.send('The final scene fades to black. The story is over. Players, please send your final recordings via DM.');

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

async function sendDiceImages(message, rolls) {
/*   for (const roll of rolls) {
    const imagePath = path.join(__dirname, `images/dice_${roll}.png`);
    try {
      await message.channel.send({ files: [imagePath] });
    } catch (error) {
      console.error('Error sending dice image:', error);
    }
  } */
}

async function sendCandleStatus(message, gameData) {
/*   const channelId = message.channel.id;
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
  } */
}

client.login(process.env.DISCORD_TOKEN);