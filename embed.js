import { EmbedBuilder } from 'discord.js';

export const helpEmbed = {
    help: new EmbedBuilder()
        .setColor(0x0099FF)
        .setTitle('Ten Candles Bot Help')
        .setDescription('List of commands and their usage:')
        .addFields(
            { name: '.startgame', value: 'Starts a new game of Ten Candles in the current channel.' },
            { name: '.nextstep', value: 'Advances character generation to the next step.' },
            { name: '.action', value: 'Allows a player to make an action roll against the GM.' },
            { name: '.help', value: 'Displays this help message.' },
            { name: '.cancelgame', value: 'Ends the current game, with GM approval.' },
            { name: '.gamestatus', value: 'Displays the current game\'s status.' },
        )
        .setTimestamp()
};