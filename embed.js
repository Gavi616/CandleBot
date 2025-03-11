import { EmbedBuilder } from 'discord.js';

export const helpEmbed = {
  help: new EmbedBuilder()
    .setColor(0x0099FF)
    .setTitle('Ten Candles Bot Help')
    .setDescription(
      'Starting a Ten Candles session:\n' +
      '`.startgame <GM ID> <Player IDs>`: Starts a Ten Candles game (with 2 to 10 players).\n\n' +
      '**Character Generation:**\n' +
      '`.nextstep`: Advances character generation.\n\n' +
      '**Gameplay:**\n' +
      '`.conflict [-burnvirtue | -burnvice | -burnmoment]`: Makes a conflict roll for success/failure and narration rights.\n' +
      '`.playrecordings`: Plays Final Recordings (when all candles are out).\n\n' +
      '**Game Management:**\n' +
      '`.cancelgame`: Cancel the game (with GM approval).\n' +
      '`.gamestatus`: Shows the game\'s status.\n' +
      '`.removeplayer <Player ID> [Reason]`: GM removes a player. Reason is optional.\n' +
      '`.leavegame [Reason]`: Player leaves the game. Reason is optional.\n' +
      '`.died <Player ID> [-martyr] [Cause]`: Mark a PC as dead. Add `-martyr` to gift Hope die(s). Cause is optional.\n\n' +
      '**Direct Message (DM) Commands:**\n' +
      '`.x`: Signals anonymously to wrap up the scene.\n' +
      '`.me`: View your character sheet.\n'
    )
    .setTimestamp()
};
