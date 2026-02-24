const v8 = require('v8');
const fs = require('fs');
const path = require('path');
module.exports = function(s,config,lang,app,io){
    const HEAPDUMP_DIR = path.join('/dev/shm', 'heapdumps');
    if (!fs.existsSync(HEAPDUMP_DIR)) {
      fs.mkdirSync(HEAPDUMP_DIR);
    }

    // Generate heap snapshot using built-in v8 module
    app.get('/debug/heapdump', (req, res) => {
      try {
        const filename = path.join(HEAPDUMP_DIR, `heapdump-${Date.now()}.heapsnapshot`);
        const snapshotStream = v8.getHeapSnapshot();
        const fileStream = fs.createWriteStream(filename);

        snapshotStream.pipe(fileStream);

        fileStream.on('finish', () => {
          console.log(`Heap dump written to ${filename}`);
          res.download(filename, (err) => {
            if (err) console.error('Error sending file:', err);
            fs.rm(filename,(err) => {
                if (err) console.error('Error removing dump from RAM', err);
            })
          });
        });

        fileStream.on('error', (err) => {
          console.error('Error writing heap dump:', err);
          res.status(500).json({ error: 'Failed to write heap dump' });
        });
      } catch (err) {
        console.error('Heap dump failed:', err);
        res.status(500).json({ error: err.message });
      }
    });

    // Delete all heap dumps
    app.get('/debug/heapdumps/delete', (req, res) => {
      fs.readdir(HEAPDUMP_DIR, (err, files) => {
        if (err) {
          return res.status(500).json({ error: err.message });
        }

        const heapFiles = files.filter(f => f.endsWith('.heapsnapshot'));

        if (heapFiles.length === 0) {
          return res.json({ message: 'No heap dumps to delete', deleted: 0 });
        }

        let deleted = 0;
        let errors = [];

        heapFiles.forEach(file => {
          const filePath = path.join(HEAPDUMP_DIR, file);
          try {
            fs.unlinkSync(filePath);
            deleted++;
            console.log(`Deleted: ${file}`);
          } catch (err) {
            errors.push({ file, error: err.message });
          }
        });

        res.json({
          message: `Deleted ${deleted} heap dump(s)`,
          deleted,
          errors: errors.length ? errors : undefined
        });
      });
    });

    // List heap dumps
    app.get('/debug/heapdumps', (req, res) => {
      fs.readdir(HEAPDUMP_DIR, (err, files) => {
        if (err) {
          return res.status(500).json({ error: err.message });
        }

        const heapFiles = files
          .filter(f => f.endsWith('.heapsnapshot'))
          .map(f => {
            const stat = fs.statSync(path.join(HEAPDUMP_DIR, f));
            return {
              name: f,
              size: stat.size,
              sizeMB: (stat.size / (1024 * 1024)).toFixed(2) + ' MB',
              created: stat.birthtime
            };
          })
          .sort((a, b) => b.created - a.created);

        res.json(heapFiles);
      });
    });

}
