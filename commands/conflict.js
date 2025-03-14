import { startTruthsSystem } from '../index.js';
import { sendCandleStatus, saveGameData } from '../utils.js';

export async function conflict(message, args, gameData) {
    const channelId = message.channel.id;
    const playerId = message.author.id;
    const playerNumericId = parseInt(playerId);

    if (!gameData[channelId]) {
        message.reply('No game is in progress in this channel. Use `.startgame` to begin.');
        return;
    }

    if (gameData[channelId].characterGenStep < 8) {
        message.reply('Character generation is not complete. Please use `.nextstep` to proceed.');
        return;
    }

    if (!gameData[channelId].players || !gameData[channelId].players[playerNumericId]) {
        console.log(`User "${message.author.username}" (ID: ${playerId}) tried to use \`.conflict\` but is not a player.`);
        return;
    }

    if (!gameData[channelId].players) {
        gameData[channelId].players = {};
    }

    if (!gameData[channelId].players[playerId]) {
        gameData[channelId].players[playerId] = { hopeDieActive: false };
    }

    let dicePool = gameData[channelId].dicePool;
    let hopeDieRoll = 0;
    let rerollOnes = false;
    let numOnesRerolled = 0; // Initialize numOnesRerolled

    let useMoment = false;
    let useVirtue = false;
    let useVice = false;

    gameData[channelId].players[playerNumericId].brinkUsedThisRoll = false;

    if (args.includes('-burnmoment') && !gameData[channelId].players[playerNumericId].hopeDieActive && !gameData[channelId].players[playerNumericId].momentBurned) {
        message.channel.send(`<@${playerId}>, please burn your Moment now.`);
        gameData[channelId].players[playerNumericId].momentBurned = true;
        useMoment = true;
    }

    if (args.includes('-burnvirtue') && !gameData[channelId].players[playerNumericId].virtueBurned) {
        message.channel.send(`<@${playerId}>, please burn your Virtue now.`);
        gameData[channelId].players[playerNumericId].virtueBurned = true;
        useVirtue = true;
    }

    if (args.includes('-burnvice') && !gameData[channelId].players[playerNumericId].viceBurned) {
        message.channel.send(`<@${playerId}>, please burn your Vice now.`);
        gameData[channelId].players[playerNumericId].viceBurned = true;
        rerollOnes = true;
    }

    if (gameData[channelId].players[playerId].hopeDieActive) {
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
    for (let i = 0; i < gameData[channelId].players[playerNumericId].hopeDice; i++) {
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
        gameData[channelId].players[playerNumericId].hopeDice++;
        message.channel.send(`<@${playerId}> has successfully achieved their Moment and gains a Hope die for future rolls.`);
    } else if (useMoment && totalPlayerSixes === 0) {
        gameData[channelId].players[playerNumericId].hopeDice = 0;
        message.channel.send(`<@${playerId}> has failed to live their Moment and loses all hope dice.`);
    }

    // Brink Logic
    let messageContent = '';

    if (totalPlayerSixes === 0) {
        // Failed Roll - Brink Prompt (DM)
        if (gameData[channelId].players[playerNumericId].momentBurned &&
            gameData[channelId].players[playerNumericId].virtueBurned &&
            gameData[channelId].players[playerNumericId].viceBurned &&
            !gameData[channelId].players[playerNumericId].brinkUsedThisRoll &&
            !gameData[channelId].players[playerNumericId].isDead) {

            try {
                const player = await message.guild.members.fetch(playerId);
                const dmChannel = await player.user.createDM();

                await dmChannel.send('You have failed this `.conflict` roll. Embrace your Brink for a full reroll? (y/n) You have 60 seconds to decide.');

                const filter = m => m.author.id === playerId && (m.content.toLowerCase().startsWith('y') || m.content.toLowerCase().startsWith('n'));
                const collected = await dmChannel.awaitMessages({ filter, max: 1, time: 60000, errors: ['time'] });

                if (collected.size > 0 && collected.first().content.toLowerCase() === 'y') {
                    gameData[channelId].players[playerNumericId].brinkUsedThisRoll = true; // Set the flag
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
                    for (let i = 0; i < gameData[channelId].players[playerNumericId].hopeDice; i++) {
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

        if (gameData[channelId].scene === 10) { // Check for Last Stand (only one candle left)
            gameData[channelId].players[playerId].isDead = true;
            message.channel.send(`**${gameData[channelId].players[playerId].name || `<@${playerId}>'s unnamed character`} has died!**\nPlease work with the GM to narrate your character's death.`);
        } else {
            // Normal Candle Extinguishing
            gameData[channelId].diceLost = ones;
            //Darken a candle and advance a scene.
            messageContent += "A candle will be extinguished ending the scene after this conflict is narrated.\n";
            gameData[channelId].scene++;
            gameData[channelId].dicePool = gameData[channelId].scene;
            sendCandleStatus(message, 11 - gameData[channelId].scene);
            await startTruthsSystem(message, channelId); // Start the truths system
        }
        saveGameData();
    } else {
        gameData[channelId].diceLost = 0;
    }

    messageContent = `**${totalPlayerSixes > 0 ? `Success!` : `Failure.`}**\n`;
    messageContent += `You rolled (${rolls.length} dice${hopeDieEmoji ? ' + Hope die' : ''}): ${diceEmojis}${hopeDieEmoji ? ` + ${hopeDieEmoji}` : ''}\n`;
    messageContent += `GM rolled (${gmDiceCount} dice): ${gmDiceEmojis}\n`;

    messageContent += `${ones > 0 ? `${ones} di${ones === 1 ? 'e' : 'ce'} removed from the communal dice pool. ${gameData[channelId].dicePool - ones} di${gameData[channelId].dicePool - ones === 1 ? 'e remains' : 'ce remain'}.` : `${gameData[channelId].dicePool - ones} di${gameData[channelId].dicePool - ones === 1 ? 'e remains' : 'ce remain'}.`}\n`;
    gameData[channelId].dicePool -= ones;

    if (gmSixes >= totalPlayerSixes && gmDiceCount > 0) {
        messageContent += `<@${gameData[channelId].gmId}, the GM, wins narration rights for this conflict.`;
    } else {
        messageContent += `<@${message.author.id}>, the acting player, wins narration rights for this conflict.`;
    }

    message.channel.send({ content: messageContent, allowedMentions: { repliedUser: false } });
}
