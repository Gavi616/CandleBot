import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType } from 'discord.js';
import { startTruthsSystem } from '../index.js';
import { saveGameData, numberToWords, getDMResponse, playRandomConflictSound } from '../utils.js';
import { SACRIFICE_TIMEOUT, BRINK_TIMEOUT, TRAIT_TIMEOUT } from '../config.js';
import { died } from './died.js';

async function extinguishCandle(message, channelId) {
  const game = gameData[channelId];
  if (!game) return;

  game.scene++;
  const litCandles = 11 - game.scene;

  if (litCandles < 1) {
    game.inLastStand = true;
    message.channel.send(`The last candle is extinguished. The darkness closes in. We are in **The Last Stand**.`);
    return;
  }
  await startChangingScenes(message, channelId);
}

async function startChangingScenes(message, channelId) {
  const game = gameData[channelId];
  if (!game) return;

  const litCandles = 11 - game.scene;
  const candlesDarkened = numberToWords(game.scene);
  // Notify the GM and players that the scene is changing.
  await message.channel.send(`**The scene has ended, and a candle has been extinguished.**\nThere are now ${litCandles} candles lit. ${candlesDarkened} have been extinguished.\n\n**Changing Scenes**\n\n`);

  //Implement the recording and narration rights code here.

  //Call start truths.
  await startTruthsSystem(client, message, channelId);

  // Notify the GM.
  await message.channel.send(`GM, please introduce the next scene.`);
}

export async function conflict(message, args, gameData) {
  const channelId = message.channel.id;
  const playerId = message.author.id;
  const playerNumericId = parseInt(playerId);
  const game = gameData[channelId];

  if (!game) {
    message.reply('There is no **Ten Candles** game is in progress in this channel.\nUse `.startgame` to begin a session.');
    return;
  }

  if (game.gmId === playerId) {
    try {
      await message.author.send({ content: 'The GM cannot use this command.' });
      await message.delete();
    } catch (error) {
      console.error(`Failed to delete message in <#${channelId}>: ${error.message}`);
    }
    return;
  }

  if (game.inLastStand) {
    message.reply("We are in **The Last Stand**. No more conflict rolls can be made.");
    return;
  }

  if (game.characterGenStep < 8) {
    try {
      await message.author.send({ content: 'This command can only be used after character generation is complete.' });
      await message.delete();
    } catch (error) {
      console.error(`Failed to delete message in <#${channelId}>: ${error.message}`);
    }
    return;
  }

  if (!game.players || !game.players[playerNumericId]) {
    console.log(`User "${message.author.username}" (ID: ${playerId}) tried to use \`.conflict\` but is not a player.`);
    return;
  }

  if (!game.players) {
    game.players = {};
  }

  if (!game.players[playerId]) {
    game.players[playerId] = { hopeDieActive: false };
  }

  let dicePool = 11 - game.scene;
  let hopeDieRoll = 0;
  let rerollOnes = false;
  let numOnesRerolled = 0;

  game.players[playerNumericId].brinkUsedThisRoll = false;

  if (game.players[playerId].hopeDieActive) {
    hopeDieRoll = Math.floor(Math.random() * 6) + 1;
  }

  let rolls = [];

  if (hopeDieRoll) {
    rolls.push(hopeDieRoll);
  }
  //Roll all hope dice.
  for (let i = 0; i < game.players[playerNumericId].hopeDice; i++) {
    rolls.push(Math.floor(Math.random() * 6) + 1);
  }

  for (let i = 0; i < dicePool; i++) {
    rolls.push(Math.floor(Math.random() * 6) + 1);
  }

  // Pre-Roll Dice Count Message
  const hopeDiceCount = game.players[playerNumericId].hopeDice;
  const gmDiceCount = 11 - game.scene;
  const preRollMessage = await message.channel.send(`**Conflict Initiated**\nCommunal Dice: ${dicePool}\nHope Dice: ${hopeDiceCount}\nGM Dice: ${gmDiceCount}\n\nThinking...`);

  // Check for 1s and prompt for Trait burning
  let ones = rolls.filter((roll, index) => roll === 1 && (hopeDieRoll !== 1 || index !== 0)).length;
  if (ones > 0) {
    await preRollMessage.edit(`**Conflict Initiated**\nCommunal Dice: ${dicePool}\nHope Dice: ${hopeDiceCount}\nGM Dice: ${gmDiceCount}\n\nThinking... (Check your DMs for Trait Burning check)`);
    const player = await message.guild.members.fetch(playerId);
    const dmChannel = await player.user.createDM();
    const topTrait = game.players[playerNumericId].stackOrder[0];
    const burnTraitConfirmation = await getDMResponse(player.user, `You rolled one or more 1s. Do you want to burn your ${topTrait} to reroll all 1s?`, TRAIT_TIMEOUT, m => m.author.id === playerId);
    if (burnTraitConfirmation && burnTraitConfirmation.toLowerCase() === 'yes') {
      rerollOnes = true;
      game.players[playerNumericId][`${topTrait.toLowerCase()}Burned`] = true;
      message.channel.send(`<@${playerId}> burned their ${topTrait}!`);
    }
  }

  if (rerollOnes) {
    const onesIndices = rolls.reduce((indices, roll, index) => {
      if (roll === 1 && (hopeDieRoll !== 1 || index !== 0)) {
        indices.push(index);
      }
      return indices;
    }, []);

    numOnesRerolled = onesIndices.length;

    onesIndices.forEach((index) => {
      rolls[index] = Math.floor(Math.random() * 6) + 1;
    });
  }

  // Count the number of 6s (successes) and 1s (for candle loss)
  let sixes = rolls.filter((roll) => roll >= 6).length;
  ones = rolls.filter((roll, index) => roll === 1 && (hopeDieRoll !== 1 || index !== 0)).length; // Exclude Hope die if it's a 1
  const totalPlayerSixes = sixes;

  //Create the Emojis for display.
  const diceEmojis = rolls.map(roll => {
    switch (roll) {
      case 1: return '⚀';
      case 2: return '⚁';
      case 3: return '⚂';
      case 4: return '⚃';
      case 5: return '⚄';
      case 6: return '⚅';
      default: return '';
    }
  }).join('');
  const hopeDieEmoji = hopeDieRoll > 0 ? (() => {
    switch (hopeDieRoll) {
      case 1: return '⚀';
      case 2: return '⚁';
      case 3: return '⚂';
      case 4: return '⚃';
      case 5: return '⚄';
      case 6: return '⚅';
      default: return '';
    }
  })() : '';

  // Moment success check
  if (game.players[playerNumericId].momentBurned && totalPlayerSixes > 0) {
    game.players[playerNumericId].hopeDice++;
    message.channel.send(`<@${playerId}> has successfully achieved their Moment and gains a Hope die for future rolls.`);
  }

  // Brink Logic
  let messageContent = '';

  if (game.players[playerNumericId].momentBurned &&
    game.players[playerNumericId].virtueBurned &&
    game.players[playerNumericId].viceBurned &&
    !game.players[playerNumericId].brinkUsedThisRoll &&
    !game.players[playerNumericId].isDead) {
    await preRollMessage.edit(`**Conflict Initiated**\nCommunal Dice: ${dicePool}\nHope Dice: ${hopeDiceCount}\nGM Dice: ${gmDiceCount}\n\nThinking... (Check your DMs for Brink check)`);
    const player = await message.guild.members.fetch(playerId);
    const dmChannel = await player.user.createDM();
    const brinkEmbed = new EmbedBuilder()
      .setColor(0x0099FF)
      .setTitle('Embrace Your Brink?')
      .setDescription('You have burned all of your traits. Embrace your Brink for a full reroll?');

    const brinkRow = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('brink_yes')
          .setLabel('Yes')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId('brink_no')
          .setLabel('No')
          .setStyle(ButtonStyle.Secondary),
      );
    const brinkMessage = await dmChannel.send({ embeds: [brinkEmbed], components: [brinkRow] });
    const brinkFilter = (interaction) => interaction.user.id === playerId && interaction.message.id === brinkMessage.id;
    const brinkCollector = dmChannel.createMessageComponentCollector({ filter: brinkFilter, time: BRINK_TIMEOUT });
    brinkCollector.on('collect', async (interaction) => {
      await interaction.deferUpdate();
      if (interaction.customId === 'brink_yes') {
        game.players[playerNumericId].brinkUsedThisRoll = true; // Set the flag
        await interaction.editReply({ content: 'You embraced your Brink!', embeds: [], components: [] });
        message.channel.send(`<@${playerId}> embraced their Brink!`);

        //Clear the dice from this roll.
        rolls = [];
        numOnesRerolled = 0;
        hopeDieRoll = 0;
        //Reroll
        if (hopeDieRoll) {
          rolls.push(hopeDieRoll);
        }
        //Roll all hope dice.
        for (let i = 0; i < game.players[playerNumericId].hopeDice; i++) {
          rolls.push(Math.floor(Math.random() * 6) + 1);
        }

        for (let i = 0; i < dicePool; i++) {
          rolls.push(Math.floor(Math.random() * 6) + 1);
        }
        // Continue with the rest of the roll logic...
        sixes = rolls.filter((roll) => roll >= 6).length;
        ones = rolls.filter((roll, index) => roll === 1 && (hopeDieRoll !== 1 || index !== 0)).length;

      } else {
        await interaction.editReply({ content: 'You chose not to embrace your Brink, for now.', embeds: [], components: [] });
        message.channel.send(`<@${playerId}> chose not to embrace their Brink. The scene will end.`); //Inform the channel of the choice.
      }
      brinkCollector.stop();
    });
    brinkCollector.on('end', async (collected, reason) => {
      if (reason === 'time') {
        await brinkMessage.edit({ content: 'You did not respond in time. The scene will end.', embeds: [], components: [] });
        message.channel.send(`<@${playerId}>, did not respond in time. The scene will end.`);
      }
      if (game.players[playerNumericId].brinkUsedThisRoll && game.players[playerNumericId].hopeDice > 0) {
        game.players[playerNumericId].hopeDice = 0;
        message.channel.send(`<@${playerId}>, lost all of their Hope dice.`);
      }
    });
  }

  // Roll GM's dice
  let gmRolls = [];
  for (let i = 0; i < gmDiceCount; i++) {
    gmRolls.push(Math.floor(Math.random() * 6) + 1);
  }

  // Count the number of 6s (successes) in the GM's roll
  let gmSixes = gmRolls.filter((roll) => roll >= 6).length;

  //Create the Emojis for display.
  const gmDiceEmojis = gmRolls.map(roll => {
    switch (roll) {
      case 1: return '⚀';
      case 2: return '⚁';
      case 3: return '⚂';
      case 4: return '⚃';
      case 5: return '⚄';
      case 6: return '⚅';
      default: return '';
    }
  }).join('');

  if (totalPlayerSixes === 0) {
    // Failed Roll - Sacrifice for Narration
    await preRollMessage.edit(`**Conflict Initiated**\nCommunal Dice: ${dicePool}\nHope Dice: ${hopeDiceCount}\nGM Dice: ${gmDiceCount}\n\nThinking... (Check your DMs for Sacrifice check)`);
    try {
      const player = await message.guild.members.fetch(playerId);
      const dmChannel = await player.user.createDM();

      const sacrificeEmbed = new EmbedBuilder()
        .setColor(0x0099FF)
        .setTitle('Sacrifice for Narration Rights')
        .setDescription('You have failed this `.conflict` roll. You may take over narration from the GM for a moment, but the cost is your character\'s life. Sacrifice your character?');

      const row = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('sacrifice_yes')
            .setLabel('Yes')
            .setStyle(ButtonStyle.Danger),
          new ButtonBuilder()
            .setCustomId('sacrifice_no')
            .setLabel('No')
            .setStyle(ButtonStyle.Secondary),
        );

      const sacrificeMessage = await dmChannel.send({ embeds: [sacrificeEmbed], components: [row] });

      const sacrificeFilter = (interaction) => interaction.user.id === playerId && interaction.message.id === sacrificeMessage.id;
      const sacrificeCollector = dmChannel.createMessageComponentCollector({ filter: sacrificeFilter, time: SACRIFICE_TIMEOUT });

      sacrificeCollector.on('collect', async (interaction) => {
        await interaction.deferUpdate();
        if (interaction.customId === 'sacrifice_yes') {
          const reason = await getDMResponse(player.user, `What was the cause of your character's death? (Optional)`, 60000, m => m.author.id === playerId);
          await interaction.editReply({ content: `You have chosen to sacrifice your character for narration rights!`, embeds: [], components: [] });
          message.channel.send(`**<@${playerId}> has chosen to sacrifice their character for narration rights!**\nPlease narrate the end of your character's story.`);
          messageContent += `<@${playerId}>, the acting player, now has narration rights for this conflict.`;
          await died(message, [`<@${playerId}>`, reason]);
        } else {
          await interaction.editReply({ content: 'You chose not to sacrifice your character.', embeds: [], components: [] });
        }
        sacrificeCollector.stop();
      });
      sacrificeCollector.on('end', async (collected, reason) => {
        if (reason === 'time') {
          await sacrificeMessage.edit({ content: 'You did not respond in time. The scene will end.', embeds: [], components: [] });
        }
      });
    } catch (error) {
      console.error('Error during Sacrifice prompt (DM):', error);
      message.channel.send(`<@${playerId}>, an error occurred. The scene will end.`);
    }
    if (!game.players[playerId].isDead) {
      if (game.scene === 10) {
        game.players[playerId].isDead = true;
        message.channel.send(`**${game.players[playerId].name || `<@${playerId}>'s unnamed character`} has died!**\nPlease work with the GM to narrate your character's death.`);
      } else {
        game.diceLost = ones;
        messageContent += "A candle will be extinguished ending the scene after this conflict is narrated.\n";
        await extinguishCandle(message, channelId);
      }
    }
    saveGameData();
  } else {
    game.diceLost = 0;
  }

  messageContent = `##You rolled (${rolls.length} dice${hopeDieEmoji ? ' + Hope die' : ''}): ${diceEmojis}${hopeDieEmoji ? ` + ${hopeDieEmoji}` : ''}\n`;
  messageContent += `##GM rolled (${gmDiceCount} dice): ${gmDiceEmojis}\n`;
  messageContent = `**${totalPlayerSixes > 0 ? `Success!` : `Failure.`}**\n`;

  messageContent += `${ones > 0 ? `${ones} di${ones === 1 ? 'e' : 'ce'} removed from the communal dice pool. ${dicePool - ones} di${dicePool - ones === 1 ? 'e remains' : 'ce remain'}.` : `${dicePool - ones} di${dicePool - ones === 1 ? 'e remains' : 'ce remain'}.`}\n`;
  game.dicePool -= ones;

  if (gmSixes >= totalPlayerSixes && gmDiceCount > 0) {
    messageContent += `<@${game.gmId}, the GM, wins narration rights for this conflict.`;
  } else {
    messageContent += `<@${message.author.id}>, the acting player, wins narration rights for this conflict.`;
  }
  await preRollMessage.edit(`**Conflict Initiated**\nCommunal Dice: ${dicePool}\nHope Dice: ${hopeDiceCount}\nGM Dice: ${gmDiceCount}\n\nThinking Complete!`);

  const voiceChannelId = game.voiceChannelId;
  const voiceChannel = client.channels.cache.get(voiceChannelId);

  if (voiceChannel && voiceChannel.type === ChannelType.GuildVoice) {
    await playRandomConflictSound(voiceChannel);
  }

  message.channel.send({ content: messageContent, allowedMentions: { repliedUser: false } });
  saveGameData();
}
