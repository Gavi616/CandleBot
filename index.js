import 'dotenv/config';
import {
  Client,
  EmbedBuilder,
  ChannelType,
  GatewayIntentBits
} from 'discord.js';
import fs from 'fs';
import { getHelpEmbed } from './embed.js';
import {
  sanitizeString,
  loadGameData,
  saveGameData,
  printActiveGames,
  loadBlocklist,
  saveBlocklist,
  gameData
} from './utils.js'; //Import gameData!
import { handleCharacterGenStep1DM, handleCharacterGenStep4DM, handleCharacterGenStep5DM, handleCharacterGenStep6DM, handleCharacterGenStep8DM } from './chargen.js';
import { startGame } from './commands/startgame.js';

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
const version = '0.9.9';

client.once('ready', () => {
  const startupTimestamp = new Date().toLocaleString();
  console.log(`Ten Candles Bot (v${version}) is ready @ ${startupTimestamp}`);
  console.log(`Logged in as ${client.user.tag} (${client.user.id})`);
  console.log(`Bot is in ${client.guilds.cache.size} server${client.guilds.cache.size === 1 ? '' : 's'}.`);
  console.log(`Command prefix is ${prefix}`);
  console.log(`Use ${prefix}help for a list of commands.`);

  // Check for valid configuration file
  if (!fs.existsSync('config.js')) {
    console.error('Configuration file not found. Please create a config.js file with the required settings.');
    return;
  }

  loadBlocklist(); //Load the blocklist on startup.
  loadGameData(); // Load game data on startup
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;

  // Find the gameData that this button press is associated with.
  let channelId = null;
  let game = null;
  for (let key in gameData) {
    const gameEntry = gameData[key];
    if (gameEntry.gmId === interaction.user.id || gameEntry.players[interaction.user.id]) {
      channelId = key;
      game = gameEntry;
      break;
    }
  }
  if (!game) {
    console.error("Game not found for interaction.", interaction);
    await interaction.reply({ content: 'No game found.', ephemeral: true });
    return;
  }
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  const channelId = message.channel.id;
  const userId = message.author.id;
  const userName = message.author.username; // Get username

  if (message.channel.type === ChannelType.DM) { // Handle DMs first
    // .x and .me command listener (for Direct Messaging)
    if (message.content.toLowerCase() === '.x') {
        const game = Object.values(gameData).find(game => {
            if (game.gmId === userId) return true;
            if (game.players && game.players[userId]) return true;
            return false;
        });

        if (!game) { //If the user is not in a game.
            message.author.send(`You are not currently in a game in any channel.`); //Let them know.
        }
        else {
            const gameChannelId = Object.keys(gameData).find(key => gameData[key] === game);
            if (gameChannelId) {
                const gameChannel = client.channels.cache.get(gameChannelId);
                if (gameChannel) {
                    gameChannel.send(`One or more players and/or the GM are ready to move on, please wrap up the scene quickly.`);
                }
            }
        }
    } else if (message.content.toLowerCase() === '.me') {
        me(message);
    } else { //Handle other DMs here.
        const game = Object.values(gameData).find(game => {
          if (game.gmId === userId) return true;
          if (game.players && game.players[userId]) return true;
          return false;
        });

        //Check if there is a game and if that game is waiting for character generation info.
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
}
  if (message.channel.type !== ChannelType.DM) {
    if (message.content.startsWith(prefix)) {
      const args = message.content.slice(prefix.length).split(/ +/);
      const command = args.shift().toLowerCase();

      // Check if the command requires a game in progress
      const game = gameData[channelId];

      const gameRequiredCommands = ['conflict', 'playrecordings', 'nextstep', 'gamestatus', 'removeplayer', 'leavegame', 'cancelgame', 'died', 'me', 'x'];

      if (gameRequiredCommands.includes(command)) {
        // Check if a game exists in the channel
        if (!gameData[channelId]) {
          message.author.send(`Message removed. There is no **Ten Candles** game in progress in <#${channelId}>.`); //Update the message here.
          try {
            await message.delete(); // Delete the command message
          } catch (deleteError) {
            console.error(`Failed to delete message in <#${channelId}>: ${deleteError.message}`); //Update the message here.
          }
          console.log(`${userName} (${userId}) tried to use .${command} in <#${channelId}>, but there is no game in progress.`); //Update the message here.
          return; // Stop processing the command
        }

        // Check if the user is a participant (player or GM)
        const game = gameData[channelId];
        if (!game.players[userId] && game.gmId !== userId) {
          message.author.send(`Message removed. You are not a participant in the **Ten Candles** game in <#${channelId}>.`); //Update the message here.
          try {
            await message.delete(); // Delete the command message
          } catch (deleteError) {
            console.error(`Failed to delete message in <#${channelId}>: ${deleteError.message}`); //Update the message here.
          }
          console.log(`${userName} (${userId}) tried to use .${command} in <#${channelId}>, but is not a participant.`); //Update the message here.
          return; // Stop processing the command
        }
      }

      // Command handling logic
      if (command === 'help') {
        const isAdmin = message.member.permissions.has('Administrator');
        const helpEmbed = getHelpEmbed(isAdmin);
        message.channel.send({ embeds: [helpEmbed.help] });
      } else if (command === 'startgame') {
        await startGame(message, gameData);
      } else if (command === 'conflict') {
        await conflict(message, args, gameData);
      } else if (command === 'playrecordings') {
        await playRecordings(message);
      } else if (command === 'nextstep') {
        nextStep(message);
      } else if (command === 'gamestatus') {
        gamestatus(message); //Call gamestatus
      } else if (command === 'removeplayer') {
        removePlayer(message, args);
      } else if (command === 'leavegame') {
        leaveGame(message, args);
      } else if (command === 'cancelgame') {
        await cancelGame(message);
      } else if (command === 'died') {
        await died(message, args);
      } else if (command === 'block') {
        blockUser(message, args);
      } else if (command === 'unblock') {
        unblockUser(message, args);
      }
    }
  }
});

async function me(message) {
  const playerId = message.author.id;
  const playerNumericId = parseInt(playerId);
  const gameChannelId = Object.keys(gameData).find(key => gameData[key].players[playerId] || gameData[key].gmId == playerId);

  if (message.channel.type !== ChannelType.DM) { // Check if it's a DM
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
      break;
    }
  }

  if (!game) {
    message.author.send(`You are not currently in a game in any channel.`);//Update the message here.
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
      { name: 'Game Channel:', value: `<#${gameChannelId}>`}, //Add the clickable channel link here.
    )
    .setTimestamp();

  try {
    await message.author.send({ embeds: [characterEmbed] }); // Send DM
    if (message.channel.type !== ChannelType.DM) {
      await message.delete(); // Delete original message
    }

  } catch (error) {
    console.error('Could not send character sheet DM:', error.message);
    if (message.channel.type !== ChannelType.DM) {
      await message.reply('Could not send character sheet DM. Please enable DMs.'); // Inform in channel if DM fails.
    }
  }
}

export async function startTruthsSystem(client, message, channelId) {
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
}
// Define gamestatus() here
function gamestatus(message) {
  const channelId = message.channel.id;
  const game = gameData[channelId];
  const gameChannelName = message.channel.name;

  if (game) {
      let statusMessage = `**Game Status in #${gameChannelName}**:\n`;
      statusMessage += `GM: <@${game.gmId}>\n`;
      statusMessage += `Players: ${game.playerOrder.map(playerId => `<@${playerId}>`).join(', ')}\n`;
      statusMessage += `Character Generation Step: ${game.characterGenStep}\n`;
      message.channel.send(statusMessage);
  } else {
      message.channel.send(`There is no game in progress in #${gameChannelName}.`);
  }
}

function blockUser(message, args, reason = 'No reason provided.') {
  const userId = args[0];
  if (!blocklist[userId]) {
    blocklist[userId] = sanitizeString(reason); // Store the reason along with the user ID
    saveBlocklist();
    if (message) {
      message.channel.send(`<@${userId}> has been added to the blocklist. Reason: ${reason}`);
    }
  } else {
    if (message) {
      message.channel.send(`<@${userId}> is already on the blocklist. Reason: ${blocklist[userId]}`);
    }
  }
}

function unblockUser(message, args) {
  const userId = args[0];
  if (blocklist[userId]) {
    delete blocklist[userId]; // Remove the user from the object
    saveBlocklist();
    if (message)
      message.channel.send(`<@${userId}> has been removed from the blocklist.`);
  } else {
    if (message)
      message.channel.send(`<@${userId}> is not on the blocklist.`);
  }
}
client.login(process.env.DISCORD_TOKEN);
