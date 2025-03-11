import { EmbedBuilder } from 'discord.js';

export const helpEmbed = {
  help: new EmbedBuilder()
    .setColor(0x0099FF)
    .setTitle('Ten Candles Bot Help')
    .setDescription(
      'Commands for playing Ten Candles. Use `.` as the prefix.\n\n' +
      '**Character Generation:**\n' +
      '`startgame <GM ID> <Player IDs>`: Starts a Ten Candles game.\n' +
      '`nextstep`: Advances character generation.\n\n' +
      '**Gameplay:**\n' +
      '`action [-burnvirtue | -burnvice | -burnmoment]`: Makes an action roll for success/failure and narration rights.\nModifiers: reroll ones (-burnvirtue or -burnvice), or try for a Hope die (-burnmoment).\n' +
      '`playrecordings`: Plays the Final Recordings (when all candles are out).\n\n' +
      '**Game Management:**\n' +
      '`cancelgame`: Cancel the game (with GM approval).\n' +
      '`gamestatus`: Shows the game\'s status.\n' +
      '`removeplayer <Player ID> [Reason]`: GM removes a player. Reason is optional.\n' +
      '`leavegame [Reason]`: Player leaves the game. Reason is optional.\n' +
      '`died <Player ID> [-martyr] [Cause]`: Mark a PC as dead. Add `-martyr` to gift Hope die(s). Cause is optional.\n\n' +
      '**Direct Message (DM) Commands:**\n' +
      '`x`: Signals anonymously to wrap up the scene.\n' +
      '`me`: View your character sheet.\n'
    )
    .setTimestamp()
};
