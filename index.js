require('dotenv').config()
const discord = require('discord.js')
const client = new discord.Client()
const prefix = process.env.BOT_PREFIX
const ytdl = require("ytdl-core")
const fetch = require("node-fetch")

const papaongStorage = require("./storage.js")
const storage = new papaongStorage()

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
client.on('message', async message => {
    if (message.author.bot) return
    if (!message.content.startsWith(prefix)) return

    let command = message.content.slice(2).split(" ")[0]
    if (command === 'p') {
        await execute(message)
    } else if (command === 'l' || command === 'list') {
        list(message)
    } else if (command === 'j' || command === 'join') {
        join(message)
    } else if (command === 'leave') {
        leave(message)
    } else if (command === 's' || command === 'skip') {
        skip(message)
    } else if (command === 'd' || command === 'delete') {
        deleteSong(message)
    } else if (command === 'stop') {
        stop(message)
    } else {
        message.channel.send("**[오류]** 무슨 말인지 모르겠다옹")
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
            play(message.guild, queue.songList[0])
        }
        return
    }

    if (songUrl.indexOf("://hastebin.com") > 0) {
        let txtUrl = songUrl.replace("hastebin.com/", "hastebin.com/raw/")
        const response = await fetch(txtUrl)
        const body = await response.text()
        let songList = body.split("\n")

        message.channel.send(`**[알림]** (헤이스트-빈) 총 ${songList.length}개의 노래를 추가할 것이애옹`)
        let itemCounter = 0
        for (const itemUrl of songList) {
            itemCounter += 1
            let itemSong = await addSong(message, itemUrl)
            if (itemSong) {
                await message.channel.send(`**[알림]** (헤이스트-빈) (${itemCounter}/${songList.length}) ${itemSong.title} 노래를 추가해옹`)
            } else {
                await message.channel.send(`**[알림]** (헤이스트-빈) (${itemCounter}/${songList.length}) \`${itemUrl}\` 노래는 추가하지 않을거애옹`)
            }
        }
    } else {
        if (await addSong(message, songUrl)) {
            await message.channel.send(`**[알림]** 새로운 노래애옹: ${song.title}`)
        }
    }

    if (!queue.playing) {
        play(message.guild, queue.songList[0])
    }
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
            console.log(err)
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
            return message.channel.send("**[오류]** 지금 재생 중인 노래는 삭제할 수 없는 것이애옹")
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
            return message.channel.send("**[오류]** 지금 재생 중인 노래는 삭제할 수 없는 것이애옹")
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
        return message.channel.send("**[알림]** 음성 채널에 들어와야 노래를 건너뛸 수 있는 것이애옹")
    }
    queue.songList = []
    storage.getAllSong()
        .then((songList) => {
            queue.songList = songList
            if (queue.connection && queue.connection.dispatcher) {
                queue.connection.dispatcher.end()
            }
        })
}

function play(guild, song) {
    if (!song) {
        queue.voiceChannel.leave()
        queue.voiceChannel = null
        queue.connection = null
        queue.playing = false
        return
    }

    queue.playing = true
    const ytdlOptions = {
        quality: 'highestaudio',
        filter: 'audioonly'
    }
    const dispatcher = queue.connection
        .play(ytdl(song.url, ytdlOptions))
        .on("finish", () => {
            queue.songList.push(queue.songList.shift())
            play(guild, queue.songList[0])
        })
        .on("error", error => {
            console.error(error)
            queue.push(queue.songList.shift())
            play(guild, queue.songList[0])
        })
    dispatcher.setVolumeLogarithmic(queue.volume / 5)
    queue.textChannel.send(`**[알림]** ${song.username}님이 신청한 ${song.title}를 재생해옹`)
}

async function addSong(message, songUrl, atFirst=false) {
    let songId = songUrl.split("v=")[1]
    let oldSong = await storage.getSong(songId)
    if (oldSong) {
        message.channel.send(`**[알림]** K 이미 추가되어있는 노래애옹: ${oldSong.title}`)
        return false
    }

    try {
        songInfo = await ytdl.getInfo(songUrl)
    } catch (err) {
        console.error(`Failed to fetch song information ${songUrl}`)
        console.error(err)
        message.channel.send(`**[오류]** ${songUrl} 주소를 불러오는데 실패한 것이애옹. URL이 정확한지 확인해주새옹.`)
        return false
    }

    const song = {
        id: songInfo.video_id,
        title: songInfo.title,
        userid: message.member.user.id,
        username: message.member.user.username,
        url: songInfo.video_url
    }

    let isNewSong = await storage.addSong(song)
    if (!isNewSong) {
        message.channel.send(`**[알림]** 이미 추가되어있는 노래애옹: ${song.title}`)
        return false
    }

    if (atFirst) {
        queue.songList.unshift(song)
    } else {
        queue.songList.push(song)
    }
    return song
}

storage.initialize()
    .then(() => {
        return storage.getAllSong()
    })
    .then((songList) => {
        queue.songList = songList
        console.log(queue.songList)
        client.login(process.env.BOT_TOKEN)
    })
