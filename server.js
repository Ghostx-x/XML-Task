import express from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import fsPromises from 'fs/promises';
import xml2js from 'xml2js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = 3000;

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

const storage = multer.memoryStorage();
const upload = multer({ storage });

app.use(express.json());

app.post('/upload', upload.single('xmlFile'), async (req, res) => {
    try {
        console.log('File uploaded:', req.file);

        const data = req.file.buffer.toString('utf8');

        const parser = new xml2js.Parser({ explicitArray: false });
        const result = await parser.parseStringPromise(data);


        const invoices = Array.isArray(result.ExportedData.Invoice)
            ? result.ExportedData.Invoice
            : [result.ExportedData.Invoice];

        for (const invoice of invoices) {
            if (
                invoice.BuyerInfo &&
                (!invoice.BuyerInfo.DeliveryLocation || invoice.BuyerInfo.DeliveryLocation === '')
            ) {
                if (
                    invoice.SupplierInfo &&
                    invoice.SupplierInfo.Taxpayer &&
                    invoice.SupplierInfo.Taxpayer.AdditionalData
                ) {
                    const additionalInfo = invoice.SupplierInfo.Taxpayer.AdditionalData;
                    const parts = additionalInfo.split(',');
                    const locationText = parts.slice(1).join(',').trim();
                    invoice.BuyerInfo.DeliveryLocation = locationText;
                }
            }
        }

        const builder = new xml2js.Builder({
            xmldec: { version: '1.0', encoding: 'UTF-8', standalone: true }
        });
        const newXml = builder.buildObject(result);

        const originalName = path.parse(req.file.originalname).name;
        const editedFilename = `${originalName}-edited.xml`;

        res.setHeader('Content-Disposition', `attachment; filename="${editedFilename}"`);
        res.setHeader('Content-Type', 'application/xml');
        res.send(newXml);

    } catch (error) {
        console.error('Error processing XML:', error);
        res.status(500).json({ message: 'Error processing XML' });
    }
});

app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});
