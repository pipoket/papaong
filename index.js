require('dotenv').config()
const discord = require('discord.js')
const client = new discord.Client()
const prefix = process.env.BOT_PREFIX
const guildWhitelist = process.env.ALLOWED_GUILD_ID.split(",")
const ytdl = require("ytdl-core")
const ytdlDiscord = require("ytdl-core-discord")
const fetch = require("node-fetch")
const hastebin = require('hastebin')

const papaongStorage = require("./storage.js")
const storage = new papaongStorage()
const papaongLibrary = require("./lib.js")
const lib = new papaongLibrary()

const queue = {
    textChannel: null,
    voiceChannel: null,
    connection: null,
    songList: [],
    volume: 5,
    playing: false
}

client.on('ready', () => {
    console.info(`Logged in as ${client.user.tag}`)
})

client.on("guildCreate", async (guild) => {
    if (guildWhitelist.includes(guild.id)) {
        console.log(`Joined a new guild: ${guild.name}`)
    } else {
        console.log(`Leave the unallowed guild: ${guild.name}`)
        await guild.leave()
    }
})

client.on('voiceStateUpdate', async (oldMember, newMember) => {
    if (queue.connection === null) {
        return
    }

    let oldUserChannel = oldMember.channel
    let newUserChannel = newMember.channel
    let botUserChannel = queue.voiceChannel

    if (botUserChannel !== oldUserChannel && botUserChannel !== newUserChannel) {
        return
    }

    if (botUserChannel.members.size <= 1) {
        await queue.textChannel.send(`**[알림]** 아무도 없네옹. 파파옹이도 음악을 멈추고 쉬러갈게옹!`)
        _stop()
    } else {
        if (queue.playing) {
            return
        }

        if (queue.songList.length > 0) {
            await queue.textChannel.send(`**[알림]** 어서오세옹. 음악을 재생할게옹!`)
            await play(queue.voiceChannel.guild, queue.songList[0])
        } else {
            await queue.textChannel.send(`**[알림]** 어서오세옹. 근데 재생할 음악이 없네옹.. 애옹애옹..`)
        }
    }
})

client.on('message', async message => {
    if (message.author.bot) return
    if (!message.content.startsWith(prefix)) return

    let command = message.content.slice(2).split(" ")[0] || ""
    command = command.trim()
    if (!command) {
        return
    }

    if (command === 'ㅔ' || command === 'p' || command === 'play') {
        await execute(message)
    } else if (command === 'ㅣ' || command === 'l' || command === 'list') {
        list(message)
    } else if (command === 'ㅓ' || command === 'j' || command === 'join') {
        join(message)
    } else if (command === 'leave') {
        leave(message)
    } else if (command === 'ㄴ' || command === 's' || command === 'skip') {
        skip(message)
    } else if (command === 'shuffle') {
        await shuffle(message)
    } else if (command === 'ㅇ' || command === 'd' || command === 'delete') {
        deleteSong(message)
    } else if (command === 'stop') {
        stop(message)
    } else if (command === 'ㄷ' || command === 'e' || command === 'export') {
        exportSong(message)
    } else if (command === 'ㅗ' || command === 'h' || command === 'help') {
        help(message)
    } else if (command === '정신차려') {
        await message.channel.send("**[정신]** 정신차리고 다시 오겠다옹.. ㅠㅠ..\n(파파옹이를 재시작합니다. 10초쯤 후에 ;;h를 입력해 동작하는지 확인하세요)")
	process.exit(0);
    } else if (command === 'destroyLeave!') {
        leaveGuild(message);
    } else {
        //message.channel.send("**[오류]** 무슨 말인지 모르겠다옹")
    }
})

async function execute(message) {
    const args = message.content.split(" ")
    message.delete()

    const voiceChannel = message.member.voice.channel
    if (!voiceChannel) {
        return message.channel.send("**[알림]** 음성 채널에 들어와야 파파옹이를 쓸 수 있는 것이애옹")
    }

    const permissions = voiceChannel.permissionsFor(message.client.user)
    if (!permissions.has("CONNECT") || !permissions.has("SPEAK")) {
        return message.channel.send("**[오류]** 음성 채널 권한이 부족해옹. 파파옹이는 아무것도 할 수 없는 것이애옹")
    }

    await join(message)

    let songUrl = args[1]
    let songInfo
    if (!songUrl) {
        if (queue.playing) {
            message.channel.send(`**[알림]** 이미 음악을 재생하고 있는 중이애옹`)
        } else {
            await play(message.guild, queue.songList[0])
        }
        return
    }

    if (songUrl.indexOf("://pastie.io") > 0) {
        let txtUrl = songUrl.replace("pastie.io/", "pastie.io/raw/")
        const response = await fetch(txtUrl)
        const body = await response.text()
        let songList = body.split("\n")

        message.channel.send(`**[알림]** (pastie) 총 ${songList.length}개의 노래를 추가할 것이애옹`)
        let itemCounter = 0
        for (const itemUrl of songList) {
            itemCounter += 1
            await addSong(message, itemUrl, atFirst=false, batchMode=true)
            if (itemCounter % 20 === 0) {
                await message.channel.send(
                    `**[알림]** (pastie) ${itemCounter}/${songList.length} 번째 음악까지 처리완료했어옹`)
            }
        }
        await message.channel.send(
            `**[알림]** (pastie) ${itemCounter}/${songList.length} 번째 음악까지 처리완료했어옹`)
    } else {
        let song = await addSong(message, songUrl)
        if (song) {
            await message.channel.send(`**[알림]** 새로운 노래애옹: ${song.title}`)
        }
    }

    if (!queue.playing) {
        await play(message.guild, queue.songList[0])
    }
}

async function list(message) {
    const args = message.content.split(" ")
    const itemCount = 10;
    let page = parseInt(args[1])
    page = isNaN(page) ? 1 : Math.max(1, page)
    const maxPage = Math.ceil(queue.songList.length / itemCount)
    page = Math.min(maxPage, page)

    const startRange = itemCount * (page - 1)
    const endRange = itemCount * page
    const songList = queue.songList.slice(startRange, endRange)

    let songTextList = [];
    songList.forEach((song, idx) => {
        songTextList.push(`\`[${startRange + idx}]\` ${song.title} (신청자: ${song.username})`)
    })
    let songText = songTextList.join("\n")

    let embed = new discord.MessageEmbed()
        .setTitle(`재생 목록이애옹 (페이지 ${page} 의 ${maxPage})`)
        .setDescription(songText)
        .setFooter(`총 ${queue.songList.length}개의 음악`)
    message.channel.send(embed)
}

async function join(message) {
    if (!message.member.voice.channel) {
        message.channel.send("**[알림]** 음성 채널에 들어와야 파옹이를 초대할 수 있는 것이애옹")
        return false
    }

    const voiceChannel = message.member.voice.channel
    if (!voiceChannel) {
        message.channel.send("**[알림]** 음성 채널에 들어와야 파파옹이를 쓸 수 있는 것이애옹")
        return false
    }

    const permissions = voiceChannel.permissionsFor(message.client.user)
    if (!permissions.has("CONNECT") || !permissions.has("SPEAK")) {
        message.channel.send("**[오류]** 음성 채널 권한이 부족해옹. 파파옹이는 아무것도 할 수 없는 것이애옹")
        return false
    }

    if (queue.connection === null) {
        queue.textChannel = message.channel
        queue.voiceChannel = voiceChannel
        try {
            var connection = await voiceChannel.join()
            queue.connection = connection
            return true
        } catch (err) {
            console.error(err)
            message.channel.send(err)
            return false
        }
    } else {
        return true
    }
}

function leave(message) {
    if (!message.member.voice.channel) {
        return message.channel.send("**[알림]** 음성 채널에 들어와야 파옹이를 쫓아낼 수 있는 것이애옹")
    }
    if (queue.voiceChannel) {
        queue.voiceChannel.leave()
        queue.voiceChannel = null
    }
    if (queue.connection) {
        queue.connection = null
    }
    queue.playing = false
}

function skip(message) {
    if (!message.member.voice.channel) {
        return message.channel.send("**[알림]** 음성 채널에 들어와야 노래를 건너뛸 수 있는 것이애옹")
    }
    if (!queue) {
        return message.channel.send("**[오류]** 건너 뛸 노래가 없는 것이애옹")
    }

    if (queue.connection && queue.connection.dispatcher) {
        queue.connection.dispatcher.end()
    }
}

async function shuffle(message) {
    if (!message.member.voice.channel) {
        return message.channel.send("**[알림]** 음성 채널에 들어와야 노래를 건너뛸 수 있는 것이애옹")
    }
    if (!queue) {
        return message.channel.send("**[오류]** 건너 뛸 노래가 없는 것이애옹")
    }

    let tmpSongList = queue.songList.splice(1)
    let shuffledSongList = lib.shuffle(tmpSongList)
    queue.songList = queue.songList.concat(shuffledSongList)

    await storage.addSongList(queue.songList)

    return message.channel.send("**[알림]** 재생 목록을 셔플했어옹")
}

function deleteSong(message) {
    if (!message.member.voice.channel) {
        return message.channel.send("**[알림]** 음성 채널에 들어와야 노래를 지울 수 있는 것이애옹")
    }
    if (!queue) {
        return message.channel.send("**[오류]** 지울 노래가 없는 것이애옹")
    }

    const args = message.content.split(" ")
    let target = args[1]
    if (!target) {
        return message.channel.send("**[오류]** 삭제할 노래 번호가 정확하지 않은 것이애옹")
    }

    let targetSongList
    if (target.indexOf("-") > 0) {
        let rangeTarget = target.split("-")
        let targetStart = Math.max(parseInt(rangeTarget[0]), 0)
        let targetEnd = parseInt(rangeTarget[1])
        let targetCount = targetEnd - targetStart + 1
        if (targetStart === 0) {
            return message.channel.send("**[오류]** 재생목록 맨 처음 노래는 삭제할 수 없는 것이애옹")
        }
        if (isNaN(targetStart) || isNaN(targetEnd) || targetStart === targetEnd || targetCount < 0) {
            return message.channel.send("**[오류]** 삭제할 노래 번호의 범위가 정확하지 않은것이애옹")
        }
        targetSongList = queue.songList.splice(targetStart, targetCount)
    } else {
        target = parseInt(target)
        if (isNaN(target)) {
            return message.channel.send("**[오류]** 삭제할 노래 번호가 정확하지 않은것이애옹")
        }
        target = Math.max(target, 0)
        if (target === 0) {
            return message.channel.send("**[오류]** 재생목록 맨 처음 노래는 삭제할 수 없는 것이애옹")
        }
        targetSongList = queue.songList.splice(target, 1)
    }

    if (targetSongList.length > 0) {
        targetSongList.forEach((songObj) => {
            storage.deleteSong(songObj)
            message.channel.send(`**[알림]** ${songObj.title} 노래를 삭제한 것이애옹`)
        })
    } else {
        message.channel.send(`**[오류]** 삭제할 노래가 하나도 없는 것이애옹. 번호가 정확한지 확인해주새옹`)
    }
}

function stop(message) {
    if (!message.member.voice.channel) {
        return message.channel.send("**[알림]** 음성 채널에 들어와야 노래를 멈출 수 있는 것이애옹")
    }
    _stop()
}

function _stop() {
    queue.songList = []
    queue.playing = false
    storage.getAllSong()
        .then((songList) => {
            queue.songList = songList
            if (queue.connection && queue.connection.dispatcher) {
                queue.connection.dispatcher.end()
            }
        })
}

function exportSong(message) {
    if (queue.songList.length === 0) {
        return message.channel.send(`**[알림]** 백업할 노래가 없는 것이애옹`)
    }

    let songUrlList = [];
    queue.songList.forEach((song) => {
        songUrlList.push(`${song.url}`)
    })
    let songUrlText = songUrlList.join("\n")
    hastebin.createPaste(songUrlText, {
        raw: false,
        contentType: 'text/plain',
        server: 'https://pastie.io',
    }, {})
        .then((urlToPaste) => {
            message.channel.send(`**[알림]** 노래 목록을 백업했어옹. 링크애옹: ${urlToPaste}`)
        })
        .catch((requestError) => {
            message.channel.send(`**[알림]** 노래 목록을 백업에 실패했어옹.. 애옹애옹...`)
        })
}

async function play(guild, song) {
    if (!song) {
        queue.voiceChannel.leave()
        queue.voiceChannel = null
        queue.connection = null
        queue.playing = false
        return
    }

    let stream;
    try {
        stream = await ytdlDiscord(song.url, {highWaterMark: 1 << 21})
    } catch (err) {
        queue.textChannel.send(`**[오류]** **${song.title}** 재생에 실패했어옹.. (${err})`)
        queue.songList.push(queue.songList.shift())
        await play(guild, queue.songList[0])
        return
    }

    queue.playing = true
    const dispatcher = queue.connection
        .play(stream, {type: 'opus', highWaterMark: 12})
        .on("finish", () => {
            if (queue.playing) {
                queue.songList.push(queue.songList.shift())
                storage.addSongList(queue.songList)
                    .then(async () => {
                        await play(guild, queue.songList[0])
                    })
            }
        })
        .on("error", async error => {
            console.error(error)
            queue.songList.push(queue.songList.shift())
            await play(guild, queue.songList[0])
        })
    dispatcher.setVolumeLogarithmic(queue.volume / 5)
    queue.textChannel.send(`**[알림]** 이번 곡은 **${song.title}** 이에옹 (신청자: ${song.username})`)
}

async function addSong(message, songUrl, atFirst=false, batchMode=false) {
    let songId = null
    if (songUrl.indexOf("v=") > 0) {
        songId = songUrl.split("v=")[1]
    } else if (songUrl.indexOf("https://youtu.be/") >= 0) {
        songId = songUrl.split("https://youtu.be/")[1]
    }
    if (!songId) {
        message.channel.send(`**[오류]** URL 형식이 이상해옹 ${songUrl}`)
        return false
    }

    let oldSong = await storage.getSong(songId)
    if (oldSong) {
        if (!batchMode) {
            message.channel.send(`**[알림]** 이미 추가되어있는 노래애옹: ${oldSong.title}`)
        }
        return false
    }

    try {
        songInfo = await ytdl.getInfo(songUrl)
    } catch (err) {
        console.error(`Failed to fetch song information ${songUrl}`)
        console.error(err)
        message.channel.send(`**[오류]** ${songUrl} 주소를 불러오는데 실패한 것이애옹. ${err}`)
        return false
    }

    const song = {
        id: songInfo.videoDetails.videoId,
        title: songInfo.videoDetails.title,
        userid: message.member.user.id,
        username: message.member.user.username,
        url: songInfo.videoDetails.video_url,
        order: 0,
    }

    let isNewSong = await storage.addSong(song)
    if (!isNewSong) {
        if (!batchMode) {
            message.channel.send(`**[알림]** 이미 추가되어있는 노래애옹: ${song.title}`)
        }
        return false
    }

    if (atFirst) {
        queue.songList.unshift(song)
    } else {
        queue.songList.push(song)
    }

    await storage.addSongList(queue.songList)
    return song
}

async function leaveGuild(message) {
    message.guild.leave()
}

async function help(message) {
    let embed = new discord.MessageEmbed()
        .setTitle("명령어 목록이애옹")
        .setDescription(""
            + "**;;p `유튜브/Pastie 링크` 또는 ;;play `유튜브/Pastie 링크`**\n"
            + "유튜브 음악 또는 Pastie 목록을 추가해옹\n\n"
            + "**;;l 또는 ;;list**\n"
            + "파파옹이가 가지고 있는 재생 목록을 표시해옹\n\n"
            + "**;;j 또는 ;;join**\n"
            + "파파옹이를 지금 참가 중인 음성채널에 초대해옹\n\n"
            + "**;;leave**\n"
            + "파파옹이를 지금 참가 중인 음성채널에서 쫓아내옹 ㅠㅠ.. 애옹애옹..\n\n"
            + "**;;s 또는 ;;skip**\n"
            + "파파옹이가 지금 재생 중인 음악을 건너뛰게 해옹\n(건너뛴 음악은 목록 맨 뒤로 이동해옹!)\n\n"
            + "**;;shuffle**\n"
            + "파파옹이가 가지고 있는 재생 목록을 셔플해옹\n(재생목록 맨 처음 음악은 셔플하지 않아옹)\n\n"
            + "**;;d `삭제할 음악 번호` 또는 ;;delete `삭제할 음악 번호`**\n"
            + "파파옹이가 가지고 있는 재생 목록에서 음악을 삭제해옹\n"
            + "(재생목록 맨 처음 음악은 지우지 못해옹. 먼저 건너뛰어주새옹)\n\n"
            + "**;;stop**\n"
            + "파파옹이의 노래 재생을 멈춰옹\n\n"
            + "**;;export**\n"
            + "파파옹이가 가지고 있는 재생 목록을 Pastie 으로 백업해옹\n\n"
            + "**;;h 또는 ;;help**\n"
            + "이 도움말을 표시해옹\n\n"
            + "**;;정신차려**\n"
            + "파파옹이가 진짜 이상하면 이걸로 재시작할 수 있어옹.. 애옹애옹.. ㅠㅠ\n"
	    + "(파파옹이를 강제로 재시작합니다. 10초 후 ;;help 명령어로 재시작을 확인 후 사용하세요)")
    message.channel.send(embed)
}

storage.initialize()
    .then(() => {
        return storage.getAllSong()
    })
    .then((songList) => {
        queue.songList = songList
        client.login(process.env.BOT_TOKEN)
    })
