const storage = require('node-persist')

class PapaongStorage {
    async initialize() {
        await storage.init({dir: 'papaong.db'})
    }

    async getAllSong() {
        let songList = await storage.values()
        songList.sort((lhs, rhs) => {
            return lhs.order - rhs.order
        })
        return songList
    }

    async getSong(id) {
        return await storage.getItem(id)
    }

    async addSong(songObj) {
        let oldObj = await storage.getItem(songObj.id)
        if (oldObj) {
            return false
        }

        await storage.setItem(songObj.id, {
            id: songObj.id,
            title: songObj.title,
            userid: songObj.userid,
            username: songObj.username,
            url: songObj.url,
            order: songObj.order,
        })
        return true
    }

    async deleteSong(songObj) {
        let oldObj = await storage.getItem(songObj.id)
        if (!oldObj) {
            return false
        }

        await storage.removeItem(songObj.id)
        return true
    }

    async addSongList(songList) {
        await storage.clear()

        let order = 0
        for (const song of songList) {
            order += 1
            song.order = order
            await this.addSong(song)
        }
    }
}

module.exports = PapaongStorage
