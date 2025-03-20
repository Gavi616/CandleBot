import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { startTruthsSystem } from '../index.js';
import { sendCandleStatus, saveGameData, numberToWords } from '../utils.js';
import { SACRIFICE_TIMEOUT, BRINK_TIMEOUT } from '../config.js';

async function extinguishCandle(message, channelId) {
  const game = gameData[channelId];
  if (!game) return;

  game.scene++; // Increment the scene count (candle darkened)
  const litCandles = 11 - game.scene;

  // Check if all the candles have been extinguished.
  if (litCandles < 1) {
    game.inLastStand = true; //This is how we know we are in The Last Stand.
    message.channel.send(`The last candle is extinguished. The darkness closes in. We are in **The Last Stand**.`);
    return; // Do not change scenes, the game is over as far as the bot is concerned. The GM can now use .playrecordings
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
    message.reply('No game is in progress in this channel. Use `.startgame` to begin.');
    return;
  }

  if (game.inLastStand) { //This will prevent any conflicts in The Last Stand.
    message.reply("We are in **The Last Stand**. No more conflict rolls can be made.");
    return;
  }

  if (game.characterGenStep < 8) {
    message.reply('Character generation is not complete. Please use `.nextstep` to proceed.');
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

  let dicePool = game.dicePool;
  let hopeDieRoll = 0;
  let rerollOnes = false;
  let numOnesRerolled = 0; // Initialize numOnesRerolled

  let useMoment = false;
  let useVirtue = false;
  let useVice = false;

  game.players[playerNumericId].brinkUsedThisRoll = false;

  if (args.includes('-burnmoment') && !game.players[playerNumericId].hopeDieActive && !game.players[playerNumericId].momentBurned) {
    message.channel.send(`<@${playerId}>, please burn your Moment now.`);
    game.players[playerNumericId].momentBurned = true;
    useMoment = true;
  }

  if (args.includes('-burnvirtue') && !game.players[playerNumericId].virtueBurned) {
    message.channel.send(`<@${playerId}>, please burn your Virtue now.`);
    game.players[playerNumericId].virtueBurned = true;
    useVirtue = true;
  }

  if (args.includes('-burnvice') && !game.players[playerNumericId].viceBurned) {
    message.channel.send(`<@${playerId}>, please burn your Vice now.`);
    game.players[playerNumericId].viceBurned = true;
    rerollOnes = true;
  }

  if (game.players[playerId].hopeDieActive) {
    hopeDieRoll = Math.floor(Math.random() * 6) + 1;
  }

  if (useVirtue || useVice) {
    rerollOnes = true;
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
  let ones = rolls.filter((roll, index) => roll === 1 && (hopeDieRoll !== 1 || index !== 0)).length; // Exclude Hope die if it's a 1
  const totalPlayerSixes = sixes;
  let gmSixes = 0;
  const gmDiceCount = 0;
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
  const gmDiceEmojis = Array.from({ length: gmDiceCount }, () => '🎲').join('');
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
  if (useMoment && totalPlayerSixes > 0) {
    game.players[playerNumericId].hopeDice++;
    message.channel.send(`<@${playerId}> has successfully achieved their Moment and gains a Hope die for future rolls.`);
  } else if (useMoment && totalPlayerSixes === 0) {
    game.players[playerNumericId].hopeDice = 0;
    message.channel.send(`<@${playerId}> has failed to live their Moment and loses all hope dice.`);
  }

  // Brink Logic
  let messageContent = '';

  if (totalPlayerSixes === 0) {
    // Failed Roll - Sacrifice for Narration
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
                    .setStyle(ButtonStyle.Danger), // Make the 'Yes' button red (danger)
                new ButtonBuilder()
                    .setCustomId('sacrifice_no')
                    .setLabel('No')
                    .setStyle(ButtonStyle.Secondary), // Make the 'No' button gray (secondary)
            );

        const sacrificeMessage = await dmChannel.send({ embeds: [sacrificeEmbed], components: [row] });

        const sacrificeFilter = (interaction) => interaction.user.id === playerId && interaction.message.id === sacrificeMessage.id;
        const sacrificeCollector = dmChannel.createMessageComponentCollector({ filter: sacrificeFilter, time: SACRIFICE_TIMEOUT });

        sacrificeCollector.on('collect', async (interaction) => {
          await interaction.deferUpdate();
          if (interaction.customId === 'sacrifice_yes') {
              const reason = interaction.message.content.split('\n').slice(1).join('\n').trim();
              await interaction.editReply({ content: `You have chosen to sacrifice your character for narration rights!`, embeds: [], components: [] });
              message.channel.send(`**<@${playerId}> has chosen to sacrifice their character for narration rights!**\nPlease narrate the end of your characters story.`);
              messageContent += `<@${playerId}>, the acting player, now has narration rights for this conflict.`;
              // Notify the GM
              const gm = await message.guild.members.fetch(game.gmId);
              let gmMessage = `<@${playerId}> has chosen to sacrifice their character for narration rights in <#${channelId}>.\n`;
              gmMessage += `Please use \`.died <@${playerId}> [reason]\` in the game channel to mark their character as dead.`;
              await gm.user.send(gmMessage);
          } else {
              await interaction.editReply({ content: 'You chose not to sacrifice your character.', embeds: [], components: [] });
              message.channel.send(`<@${playerId}> chose not to sacrifice their character.`);
                // Failed Roll - Brink Prompt (DM)
                if (game.players[playerNumericId].momentBurned &&
                    game.players[playerNumericId].virtueBurned &&
                    game.players[playerNumericId].viceBurned &&
                    !game.players[playerNumericId].brinkUsedThisRoll &&
                    !game.players[playerNumericId].isDead) {

                    const brinkEmbed = new EmbedBuilder()
                        .setColor(0x0099FF)
                        .setTitle('Embrace Your Brink?')
                        .setDescription('You have failed this `.conflict` roll, and have burned all of your traits. Embrace your Brink for a full reroll?');

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
                    });
                }
            }
            sacrificeCollector.stop();
        });
        sacrificeCollector.on('end', async (collected, reason) => {
            if (reason === 'time') {
                await sacrificeMessage.edit({ content: 'You did not respond in time. The scene will end.', embeds: [], components: [] });
                message.channel.send(`<@${playerId}>, did not respond in time. The scene will end.`);
            }
        });
    } catch (error) {
        console.error('Error during Sacrifice prompt (DM):', error);
        message.channel.send(`<@${playerId}>, an error occurred. The scene will end.`);
    }
    if (!game.players[playerId].isDead) { //Only check if they are not already dead.
        if (game.scene === 10) { // Check for Last Stand (only one candle left)
            game.players[playerId].isDead = true;
            message.channel.send(`**${game.players[playerId].name || `<@${playerId}>'s unnamed character`} has died!**\nPlease work with the GM to narrate your character's death.`);
        } else {
            // Normal Candle Extinguishing
            game.diceLost = ones;
            //Darken a candle and advance a scene.
            messageContent += "A candle will be extinguished ending the scene after this conflict is narrated.\n";
            await extinguishCandle(message, channelId);
        }
    }
    saveGameData();
  } else {
    game.diceLost = 0;
  }

  messageContent = `**${totalPlayerSixes > 0 ? `Success!` : `Failure.`}**\n`;
  messageContent += `You rolled (${rolls.length} dice${hopeDieEmoji ? ' + Hope die' : ''}): ${diceEmojis}${hopeDieEmoji ? ` + ${hopeDieEmoji}` : ''}\n`;
  messageContent += `GM rolled (${gmDiceCount} dice): ${gmDiceEmojis}\n`;

  messageContent += `${ones > 0 ? `${ones} di${ones === 1 ? 'e' : 'ce'} removed from the communal dice pool. ${game.dicePool - ones} di${game.dicePool - ones === 1 ? 'e remains' : 'ce remain'}.` : `${game.dicePool - ones} di${game.dicePool - ones === 1 ? 'e remains' : 'ce remain'}.`}\n`;
  game.dicePool -= ones;

  if (gmSixes >= totalPlayerSixes && gmDiceCount > 0) {
    messageContent += `<@${game.gmId}, the GM, wins narration rights for this conflict.`;
  } else if (!game.players[playerId].isDead) { //They are only the narrator if they are not dead.
    messageContent += `<@${message.author.id}>, the acting player, wins narration rights for this conflict.`;
  }

  message.channel.send({ content: messageContent, allowedMentions: { repliedUser: false } });
}
