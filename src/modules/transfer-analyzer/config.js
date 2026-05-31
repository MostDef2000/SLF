// 1.x Transfer Analyzer Config
// ============================================================

CONFIG.TRANSFER_ANALYZER = {
    cacheTtlDays: 7,
    requestDelayMs: 900,

    slfAlter: {
        cacheTtlDays: 1,
        eligibleMinutesPct: 40
    },

    ageGroups: {
        academyMax: 18,
        growthMax: 21,
        lateGrowthMax: 24,
        primeMax: 29,
        shortTermMax: 32
    },

    tmValue: {
        high: 1000000,
        good: 300000,
        normal: 100000
    },

    valueTrend: {
        nearPeakRatio: 0.80,
        stillValuableRatio: 0.50,
        belowPeakRatio: 0.20,
        fallenRatio: 0.10,
        oldPeakYears: 5
    },

    currentClub: {
        retiredTerms: [
            'retired',
            'career break',
            'career ended',
            'завершил карьеру'
        ],

        freeAgentTerms: [
            'without club',
            'no club',
            'free agent',
            'vereinslos',
            'без клуба'
        ]
    },

    agent: {
        noAgentTerms: [
            'no agent',
            'without agent',
            'no agency',
            'kein berater',
            'без агента'
        ]
    },

    verdict: {
        priorityScore: 13,
        targetScore: 8,
        watchlistScore: 3,

        highRiskRedFlags: 3,
        manualCheckRedFlags: 1
    },

    eliteAcademies: [
        { label: 'Benfica academy', patterns: ['benfica', 'sl benfica'] },
        {
            label: 'Barcelona / La Masia',
            patterns: [
                'barcelona',
                'fc barcelona',
                'la masia',
                'barça',
                'barca',
                'barça youth',
                'barca youth',
                'barça u16',
                'barca u16',
                'barça u18',
                'barca u18',
                'barça u19',
                'barca u19',
                'barça atlètic',
                'barca atletic',
                'fc barcelona u16',
                'fc barcelona u18',
                'fc barcelona u19'
            ]
        },
        { label: 'Ajax academy', patterns: ['ajax', 'afc ajax'] },
        { label: 'River Plate academy', patterns: ['river plate'] },
        { label: 'Boca Juniors academy', patterns: ['boca juniors'] },
        { label: 'Sporting CP academy', patterns: ['sporting cp', 'sporting lisbon', 'sporting clube'] },
        { label: 'Real Madrid academy', patterns: ['real madrid', 'real madrid castilla'] },
        { label: 'Lyon academy', patterns: ['olympique lyon', 'lyon'] },
        { label: 'Dinamo Zagreb academy', patterns: ['dinamo zagreb'] },
        { label: 'Dynamo Kyiv academy', patterns: ['dynamo kyiv', 'dinamo kiev'] },
        { label: 'Shakhtar academy', patterns: ['shakhtar'] },
        { label: 'PSV academy', patterns: ['psv'] },
        { label: 'Feyenoord academy', patterns: ['feyenoord'] },
        { label: 'Porto academy', patterns: ['porto', 'fc porto'] },
        { label: 'Chelsea academy', patterns: ['chelsea'] },
        { label: 'Man City academy', patterns: ['manchester city', 'man city'] },
        { label: 'Arsenal academy', patterns: ['arsenal'] },
        { label: 'Liverpool academy', patterns: ['liverpool'] },
        { label: 'PSG academy', patterns: ['paris saint-germain', 'psg'] },
        { label: 'Bayern academy', patterns: ['bayern', 'bayern munich'] },
        { label: 'Dortmund academy', patterns: ['borussia dortmund', 'dortmund'] },
        { label: 'Atalanta academy', patterns: ['atalanta'] },
        { label: 'Partizan academy', patterns: ['partizan'] },
        { label: 'Crvena Zvezda academy', patterns: ['crvena zvezda', 'red star'] },
        { label: 'Flamengo academy', patterns: ['flamengo'] },
        { label: 'São Paulo academy', patterns: ['sao paulo', 'são paulo'] },
        { label: 'Palmeiras academy', patterns: ['palmeiras'] },
        { label: 'Vélez academy', patterns: ['velez', 'vélez'] },
        { label: 'Defensor Sporting academy', patterns: ['defensor sporting'] }
    ],

    strongAcademies: [
        { label: 'Brighton strong club trace', patterns: ['brighton'] },
        { label: 'Southampton academy', patterns: ['southampton'] },
        { label: 'Athletic Bilbao academy', patterns: ['athletic bilbao', 'athletic club'] },
        { label: 'Villarreal academy', patterns: ['villarreal'] },
        { label: 'Valencia academy', patterns: ['valencia'] },
        { label: 'Sevilla academy', patterns: ['sevilla'] },
        { label: 'Monaco academy', patterns: ['monaco'] },
        { label: 'Rennes academy', patterns: ['rennes'] },
        { label: 'Lille academy', patterns: ['lille'] },
        { label: 'AZ academy', patterns: ['az alkmaar', 'az'] },
        { label: 'Anderlecht academy', patterns: ['anderlecht'] },
        { label: 'Genk academy', patterns: ['genk'] },
        { label: 'Club Brugge academy', patterns: ['club brugge'] },
        { label: 'Basel academy', patterns: ['basel'] },
        { label: 'Salzburg academy', patterns: ['salzburg', 'red bull salzburg'] },
        { label: 'Nordsjaelland academy', patterns: ['nordsjaelland', 'nordsjælland'] },
        { label: 'Midtjylland academy', patterns: ['midtjylland'] },
        { label: 'Hajduk academy', patterns: ['hajduk split'] },
        { label: 'Sparta Prague academy', patterns: ['sparta prague'] },
        { label: 'Slavia Prague academy', patterns: ['slavia prague'] }
    ]
};
// ============================================================
