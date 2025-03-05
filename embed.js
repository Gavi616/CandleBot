import { EmbedBuilder } from 'discord.js';

export const helpEmbed = {
    help: new EmbedBuilder()
        .setColor(0x0099FF)
        .setTitle('Ten Candles Bot Help')
        .setDescription('List of commands and their usage:')
        .addFields(
            { name: '.startgame', value: 'Starts a new game of Ten Candles in the current channel.' },
            { name: '.joingame', value: 'Joins an existing game in the current channel.' },
            { name: '.leavegame', value: 'Leaves the game in the current channel.' },
            { name: '.nextstep', value: 'Advances the game to the next step.' },
            { name: '.action [number]', value: 'Rolls a number of dice, or a specific number.' },
            { name: '.candles', value: 'Displays the current candle status.' },
            { name: '.help', value: 'Displays this help message.' },
            { name: '.endgame', value: 'Ends the current game.' },
        )
        .setTimestamp()
};