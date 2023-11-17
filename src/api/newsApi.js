const express = require('express');
const axios = require('axios');
const pool = require('../db');
const router = express.Router();

const apiUrl = 'https://map.juniormininghub.com/api/newsArticlesAll';


async function saveDataToDatabase(data) {
    // console.log('doen', data);
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        for (const article of data.regularData || []) {
            const queryText = `
                INSERT INTO regular_news (id, title, description, date, commodities)
                VALUES ($1, $2, $3, $4, $5)
                ON CONFLICT (id) DO NOTHING;
            `;

            await client.query(queryText, [article.id, article.title, article.description, article.date, article.commodities]);
        }

        for (const article of data.subscribedData || []) {
            const queryText = `
                INSERT INTO subscribed_news (id, title, description, date, commodities, logoUrl)
                VALUES ($1, $2, $3, $4, $5, $6)
                ON CONFLICT (id) DO NOTHING;
            `;

            await client.query(queryText, [article.id, article.title, article.description, article.date, article.commodities, article.logoUrl]);
        }

        await client.query('COMMIT');
    } catch (e) {
        await client.query('ROLLBACK');
        console.error('Database Error:', e.message);
        console.error('Data:', JSON.stringify(data));
        throw e;
    } finally {
        client.release();
    }
}


async function getAllData(startDate = getCurrentDate(), endDate = getCurrentDate()) {
    const allData = {
        regularData: [],
        subscribedData: []
    };

    let page = 1;
    let hasMorePages = true;

    while (hasMorePages) {
        const currentPageData = await getNewsData(page, startDate, endDate);

        const filteredData = filterDataByDate(currentPageData.data, startDate, endDate);

        if (currentPageData.subscribed) {
            const filteredSubscribedData = filterDataByDate(currentPageData.subscribed, startDate, endDate);
            allData.subscribedData.push(...filteredSubscribedData);
        }

        allData.regularData.push(...filteredData);

        hasMorePages = currentPageData.pagination.currentPage < currentPageData.pagination.pages;
        page++;
    }
    return allData;
}

router.get('/', async (req, res) => {
    try {
        const startDate = req.query.startDate || getCurrentDate();
        const endDate = req.query.endDate || getCurrentDate();

        const allData = await getAllData(startDate, endDate);
        // console.log('allData:', allData);
        await saveDataToDatabase(allData);

        res.status(200).json(allData);
    } catch (error) {
        console.error('Error:', error.message);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

async function getNewsData(page, startDate, endDate) {
    try {
        const response = await axios.post(apiUrl, {
            page,
            filters: {
                country: "",
                state: "",
                area: "",
                commodity: [],
                type: [],
                article: "",
                project: "",
                company: "",
                ticker: "",
                "free-text-search": "",
                date: {
                    fromDate: startDate,
                    toDate: endDate
                },
                countryWhere: "all",
                stateWhere: "all",
                areaWhere: "all",
                commoditiesWhere: "all",
                marketcap: {
                    min: 0,
                    max: 10000
                },
                outstandingshares: {
                    min: 0,
                    max: 10000
                },
                mode: "normal"
            }
        },
            {
                headers: {
                    'Content-Type': 'application/json'
                }
            });

        return processResponse(response);
    } catch (error) {
        console.error('API Call Error:', error.message);
        throw new Error('API request failed');
    }
}

function processResponse(response) {
    const { status, data, subscribed } = response.data;

    if (status === 'success') {
        return {
            data: data.map(article => ({
                id: article.id,
                title: article.title,
                description: article.description,
                date: article.date,
                commodities: article.commodities,
            })),
            subscribed: subscribed.map(subscribedArticle => ({
                id: subscribedArticle.id,
                title: subscribedArticle.title,
                description: subscribedArticle.description,
                date: subscribedArticle.date,
                logoUrl: `https://map.juniormininghub.com/company_logo/${subscribedArticle.company_id}`,
                commodities: subscribedArticle.commodities,
            })),
            pagination: response.data.pagination
        };
    } else {
        console.error('Error:', status);
        throw new Error('API request failed');
    }
}

function getCurrentDate() {
    const today = new Date();
    const year = today.getFullYear();
    const month = (today.getMonth() + 1).toString().padStart(2, '0');
    const day = today.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function filterDataByDate(data, startDate, endDate) {
    return data.filter(article => {
        const articleDate = new Date(article.date).toISOString().split('T')[0];
        return articleDate >= startDate && articleDate <= endDate;
    });
}

module.exports = router;
