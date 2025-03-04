const { EmbedBuilder } = require('discord.js');

const helpEmbed = new EmbedBuilder()
  .setColor('#0099ff')
  .setTitle('Ten Candles Bot Help')
  .setDescription('List of available commands:')
  .addFields(
    { name: '.help', value: 'Shows this help message.' },
    { name: '.startgame <GM ID> <Player IDs (space-separated)>', value: 'Starts a new Ten Candles game. Requires 2 to 10 players and a GM.\nExample: `.startgame @GM @Player1 @Player2` ...' },
    { name: '.nextstep', value: 'Advances to the next step of character generation.' },
	{ name: '.gamestatus', value: 'Displays the current game\'s status (scene or character generation step).' },
    { name: '.action [-trait] [-moment] [-brink] [-hope]', value: 'Rolls dice for an action. Determines narration rights.\nExample: `.action -trait`' },
	{ name: '.playrecordings', value: 'Plays final recordings after all characters have perished.' },
    { name: '.cancelgame', value: 'Cancels the current game and deletes all game data (after GM confirmation).' }
  );

function sendDiceEmbed(message, diceResults, imagePath) {
  const diceEmbed = new EmbedBuilder()
    .setColor('#0099ff')
    .setTitle('Dice Results')
    .setThumbnail('attachment://dice_6.png');
}

function sendStatusEmbed(message, player) {
  const statusEmbed = new EmbedBuilder()
    .setColor(player.candleStatus === 'lit' ? '#FFFF00' : '#000000')
    .setTitle(`Candle Status`)
    .setDescription(`Candle is ${player.candleStatus}`);
  return statusEmbed;
}

module.exports = { help: helpEmbed, sendDiceEmbed, sendStatusEmbed };