import { startTruthsSystem } from '../index.js';
import { sendCandleStatus, saveGameData } from '../utils.js';

async function extinguishCandle(message, channelId) {
  const game = gameData[channelId];
  if (!game) return;

  game.scene++; // Increment the scene count (candle darkened)
  const litCandles = 11 - game.scene;

  // Check if all the candles have been extinguished.
  if (litCandles < 1) {
    game.inLastStand = true; //This is how we know we are in The Last Stand.
    message.channel.send(`The last candle is extinguished. The darkness closes in. We are in **The Last Stand**.`);
    return; // Do not change scenes, the game is over.
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
  await message.channel.send(`**GM, please create the next scene. Then use the \`.nextstep\` command.**`);
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
    message.reply("We are in **The Last Stand**. No more conflict rolls can be made. You may take over narration from the GM for a moment, but the cost is your character's life.");
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
    // Failed Roll - Brink Prompt (DM)
    if (game.players[playerNumericId].momentBurned &&
      game.players[playerNumericId].virtueBurned &&
      game.players[playerNumericId].viceBurned &&
      !game.players[playerNumericId].brinkUsedThisRoll &&
      !game.players[playerNumericId].isDead) {

      try {
        const player = await message.guild.members.fetch(playerId);
        const dmChannel = await player.user.createDM();

        await dmChannel.send('You have failed this `.conflict` roll. Embrace your Brink for a full reroll? (y/n) You have 60 seconds to decide.');

        const filter = m => m.author.id === playerId && (m.content.toLowerCase().startsWith('y') || m.content.toLowerCase().startsWith('n'));
        const collected = await dmChannel.awaitMessages({ filter, max: 1, time: 60000, errors: ['time'] });

        if (collected.size > 0 && collected.first().content.toLowerCase() === 'y') {
          game.players[playerNumericId].brinkUsedThisRoll = true; // Set the flag
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
          await dmChannel.send('You chose not to embrace your Brink, for now.');
          message.channel.send(`<@${playerId}> chose not to embrace their Brink. The scene will end.`); //Inform the channel of the choice.
        }
      } catch (error) {
        if (error.message === 'time') {
          await message.guild.members.fetch(playerId).then(player => player.user.send('You did not respond in time. The scene will end.'));
          message.channel.send(`<@${playerId}>, did not respond in time. The scene will end.`);
        } else {
          console.error('Error during Brink prompt (DM):', error);
          await message.guild.members.fetch(playerId).then(player => player.user.send('An error occurred. The scene will end.'));
          message.channel.send(`<@${playerId}>, an error occurred. The scene will end.`);
        }
      }
    }

    if (game.scene === 10) { // Check for Last Stand (only one candle left)
      game.players[playerId].isDead = true;
      message.channel.send(`**${game.players[playerId].name || `<@${playerId}>'s unnamed character`} has died!**\nPlease work with the GM to narrate your character's death.`);
    } else {
      // Normal Candle Extinguishing
      game.diceLost = ones;
      //Darken a candle and advance a scene.
      messageContent += "A candle will be extinguished ending the scene after this conflict is narrated.\n";
      await extinguishCandle(message, channelId);
      //Start Truths removed.
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
  } else {
    messageContent += `<@${message.author.id}>, the acting player, wins narration rights for this conflict.`;
  }

  message.channel.send({ content: messageContent, allowedMentions: { repliedUser: false } });
}
