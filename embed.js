import { EmbedBuilder } from 'discord.js';
import { getGameData } from './utils.js';

export function getHelpEmbed(isAdmin, message) {
  const channelId = message.channel.id;
  const game = getGameData(channelId);
  const isGM = game && game.gmId === message.author.id;

  const baseEmbed = new EmbedBuilder()
    .setColor(0x0099FF)
    .setTitle('Ten Candles Bot Help')
    .setDescription(
      'Start a Ten Candles session:\n' +
      '`.startgame <GM ID> <Player IDs>`: Starts a Ten Candles game.\n\n' +
      '**Gameplay:**\n' +
      '`.conflict`: Makes a conflict roll for success / failure check & determines narration rights.\n\n' +
      '**Game Management:**\n' +
      '`.gamestatus`: Shows the game\'s status.\n' +
      '`.leavegame [Reason]`: Player leaves the game.\n\n' +
      '**Direct Message Commands:**\n' +
      '`.gear [add, remove, edit] itemname`: Edit your character\'s inventory\n' +
      '`.x`: Signals anonymously to wrap up the scene.\n' +
      '`.me`: View your character sheet.\n'
    )
    .setTimestamp();

  if (isGM) {
    baseEmbed.addFields({
      name: '\n\n**GM Only Commands:**',
      value: '`.theme [description]`: Saves the theme description and advances character generation to Step Two.\n' +
        '`.prevstep`: Goes back one character generation step.\n' +
        '`.cancelgame`: Cancel the game.\n' +
        '`.removeplayer <Player ID> [Reason]`: Removes a player.\n' +
        '`.died <Player ID> [-martyr] [Cause]`: Marks a PC as dead. Martyr modifier allows gifting of Hope die.\n'
    });
  }

  if (isAdmin) {
    baseEmbed.addFields({
      name: '\n\n**Moderation Commands:**',
      value: '`.blockuser <User ID> [Reason]`: Block a user *from using the* `.startgame` *command only*.\n' +
        '`.unblockuser <User ID>`: Unblock a user.\n' +
        '`.whitelist <Channel ID> [remove]`: Add or remove a channel from the whitelist.\n'
    });
  }

  return { help: baseEmbed };
}