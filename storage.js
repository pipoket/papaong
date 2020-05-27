const storage = require('node-persist')

class PapaongStorage {
    async initialize() {
        await storage.init({dir: 'papaong.db'})
    }

    async getAllSong() {
        let songList = await storage.values()
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
}

module.exports = PapaongStorage
