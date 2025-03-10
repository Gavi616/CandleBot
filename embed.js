import { EmbedBuilder } from 'discord.js';

export const helpEmbed = {
    help: new EmbedBuilder()
        .setColor(0x0099FF)
        .addFields(
            { name: '.startgame <GM ID> <Player IDs space-separated>', value: 'Starts a Ten Candles game session in the current channel.' },
            { name: '.nextstep', value: 'Advances character generation.' },
            { name: '.action', value: 'Allows a player to make an action roll against the GM for narration rights.' },
            { name: '  -burnvirtue *or* -burnvice', value: '`.action` modifiers burns a specific Trait card to reroll all ones.' },
            { name: '  -burnmoment', value: '`.action` modifier burns the player\'s Moment card to try for a Hope die.' },
            { name: '.playrecordings', value: 'Once all candles are extinguished & all characters have perished.' },
            { name: '.cancelgame', value: 'Ends the current game (GM\'s approval required).' },
            { name: '.gamestatus', value: 'Displays the current game\'s status.' },
            { name: '.removeplayer <Player ID> [Reason]', value: 'GM may remove a player from the game.' },
            { name: '.leavegame [Reason]', value: 'Players may remove themselves from the game.' },
            { name: '.died <Player ID> [-martyr] [Cause]', value: 'GM marks PC as dead, but may still establish truths. -martyr gifts Hope die.' },
            { name: '.x (via direct message only)', value: 'Anonymously signals that you would like to wrap up the scene.' },
            { name: '.me (via direct message only)', value: 'Generates a current character sheet for your character.' },
        )
};