import { EmbedBuilder } from 'discord.js';

export const helpEmbed = {
    help: new EmbedBuilder()
        .setColor(0x0099FF)
        .setTitle('Ten Candles Bot Help')
        .setDescription('List of commands and their usage:')
        .addFields(
			{ name: '.help', value: 'Displays this help message.' },
            { name: '.startgame', value: 'Starts a new game of Ten Candles in the current channel.' },
            { name: '.nextstep', value: 'Advances character generation to the next step.' },
            { name: '.action', value: 'Allows a player to make an action roll against the GM.' },
            { name: '  -virtue', value: '`.action` modifier burns the player\'s Virtue card to reroll all ones.' },
            { name: '  -vice', value: '`.action` modifier burns the player\'s Vice card to reroll all ones.' },
            { name: '  -moment', value: '`.action` modifier burns the player\'s Moment card to try for a Hope die.' },
            { name: '  -brink', value: 'After a failed roll, use this `.action` modifier and embrace your Brink to reroll all dice! Brinks are not burned!' },
			{ name: '.playrecordings', value: 'Once all candles are extinguished and all of the characters have perished..'},
            { name: '.cancelgame', value: 'Ends the current game, with GM approval.' },
            { name: '.gamestatus', value: 'Displays the current game\'s status.' },
        )
        .setTimestamp()
};