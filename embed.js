import { EmbedBuilder } from 'discord.js';

export function getHelpEmbed(isAdmin) {
  const baseEmbed = new EmbedBuilder()
    .setColor(0x0099FF)
    .setTitle('Ten Candles Bot Help')
    .setDescription(
      'Starting a Ten Candles session:\n' +
      '`.startgame <GM ID> <Player IDs>`: Starts a Ten Candles game.\n\n' +
      '**Character Generation:**\n' +
      '`.nextstep`: Advances character generation.\n\n' +
      '**Gameplay:**\n' +
      '`.conflict [-burnvirtue | -burnvice | -burnmoment]`: Makes a conflict roll for narration rights.\n' +
      '`.playrecordings`: Plays Final Recordings (when all candles are out).\n\n' +
      '**Game Management:**\n' +
      '`.cancelgame`: Cancel the game (with GM approval).\n' +
      '`.gamestatus`: Shows the game\'s status.\n' +
      '`.removeplayer <Player ID> [Reason]`: GM removes a player.\n' +
      '`.leavegame [Reason]`: Player leaves the game.\n' +
      '`.died <Player ID> [-martyr] [Cause]`: Marks a PC as dead.\n\n' +
      '**Direct Message (DM) Commands:**\n' +
      '`.x`: Signals anonymously to wrap up the scene.\n' +
      '`.me`: View your character sheet.'
    )
    .setTimestamp();

  if (isAdmin) {
    baseEmbed.addFields({
      name: '\n\n**Moderation Commands:**',
      value: '`.block <User ID> [Reason]`: Block a user *from using* `.startgame` *only*.\n' +
        '`.unblock <User ID>`: Unblock a user.'
    });
  }

  return { help: baseEmbed };
}