require('dotenv').config()
const discord = require('discord.js')
const client = new discord.Client()
const prefix = process.env.BOT_PREFIX
const ytdl = require("ytdl-core")

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
    if (message.content.startsWith(`${prefix}p`)) {
        execute(message)
    } else if (message.content.startsWith(`${prefix}l`)) {
    } else if (message.content.startsWith(`${prefix}s`)) {
        skip(message)
    } else if (message.content.startsWith(`${prefix}stop`)) {
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

    let songUrl = args[1]
    let songInfo
    if (!songUrl) {
        return message.channel.send("**[오류]** 재생할 음악 유튜브 링크가 필요하다옹")
    }

    try {
        songInfo = await ytdl.getInfo(songUrl)
    } catch (err) {
        console.error(`Failed to play song ${songUrl}`)
        console.error(err)
        return message.channel.send(`**[오류]** ${songUrl} 재생에 실패했다옹. URL이 정확한지 확인해달라옹`)
    }

    console.info(songInfo)
    return

    const song = {
        title: songInfo.title,
        userid: message.member.user.id,
        username: message.member.user.username,
        url: songInfo.video_url
    }

    if (queue.connection === null) {
        queue.songList.push(song)
        queue.textChannel = message.channel
        queue.voiceChannel = voiceChannel
        try {
            var connection = await voiceChannel.join()
            queue.connection = connection
            play(message.guild, queue.songList[0])
        } catch (err) {
            console.log(err)
            return message.channel.send(err)
        }
    } else {
        queue.songList.push(song)
        return message.channel.send(`[알림] 노래를 추가했다옹: ${song.title}`)
    }
}

function skip(message) {
    if (!message.member.voice.channel) {
        return message.channel.send("**[알림]** 음성 채널에 들어와야 노래를 건너뛸 수 있는 것이애옹")
    }
    if (!queue) {
        return message.channel.send("**[오류]** 건너 뛸 노래가 없는 것이애옹")
    }
    queue.connection.dispatcher.end()
}

function stop(message) {
    if (!message.member.voice.channel) {
        return message.channel.send("**[알림]** 음성 채널에 들어와야 노래를 건너뛸 수 있는 것이애옹")
    }
    queue.songList = []
    queue.connection.dispatcher.end()
}

function play(guild, song) {
    if (!song) {
        queue.voiceChannel.leave()
        return
    }

    const ytdlOptions = {
        quality: 'highestaudio',
        filter: 'audioonly'
    }
    const dispatcher = queue.connection
        .play(ytdl(song.url, ytdlOptions))
        .on("finish", () => {
            queue.songList.shift()
            play(guild, queue.songList[0])
        })
        .on("error", error => console.error(error))
    dispatcher.setVolumeLogarithmic(queue.volume / 5)
    queue.textChannel.send(`**[알림]** ${song.username}님이 신청한 ${song.title}를 재생한다옹`)
}

client.login(process.env.BOT_TOKEN)
