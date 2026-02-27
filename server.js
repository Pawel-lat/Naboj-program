const express = require("express");
const app = express();
app.use(express.json());
app.use(express.static("public"));

const MAX_TASKS = 75;
const ACTIVE_TASKS = 6;

let teams = [];
let nextTeamId = 1;

// Tworzenie drużyny
function createTeam(name, startTask) {
    let tasks = Array(MAX_TASKS).fill("grey");
    let taskStartTimes = Array(MAX_TASKS).fill(null);

    for (let i = 0; i < ACTIVE_TASKS; i++) {
        let idx = startTask - 1 + i;
        if (idx < MAX_TASKS) {
            tasks[idx] = "empty";
            taskStartTimes[idx] = Date.now(); // czas przydzielenia
        }
    }

    return {
        id: nextTeamId++,
        name,
        points: 0,
        startTask,
        tasks,
        taskStartTimes,
        solves: [] // { task: num, time: ms od przydzielenia }
    };
}

// Dodanie drużyny
app.post("/add-team", (req, res) => {
    if (teams.length >= 9)
        return res.json({ error: "Max 9 drużyn" });

    const { name, startTask } = req.body;
    const team = createTeam(name, startTask);
    teams.push(team);

    res.json({ success: `Dodano drużynę nr ${team.id}` });
});

// Pobranie rankingów (sortowana kopia)
app.get("/teams", (req, res) => {
    const sorted = [...teams].sort((a, b) => b.points - a.points);
    res.json(sorted);
});

// Skanowanie kodu
app.post("/scan", (req, res) => {
    const { code } = req.body;

    if (!code || code.length !== 4)
        return res.json({ error: "Kod musi mieć 4 cyfry" });

    const teamNumber = parseInt(code[0]);
    const taskNumber = parseInt(code.slice(1));

    const team = teams.find(t => t.id === teamNumber);
    if (!team)
        return res.json({ error: "Nie istnieje drużyna o tym numerze" });

    const idx = taskNumber - 1;
    if (idx < 0 || idx >= MAX_TASKS)
        return res.json({ error: "Nieprawidłowy numer zadania" });

    if (team.tasks[idx] === "full")
        return res.json({ error: "Drużyna już zrobiła to zadanie" });

    if (team.tasks[idx] !== "empty")
        return res.json({ error: "Drużyna nie powinna mieć tego zadania" });

    // Czas od przydzielenia zadania
    const startTime = team.taskStartTimes[idx];
    const solveTime = Date.now() - startTime;

    team.tasks[idx] = "full";
    team.points++;
    team.solves.push({ task: taskNumber, time: solveTime });

    // Przydzielenie następnego zadania
    const next = idx + ACTIVE_TASKS;
    if (next < MAX_TASKS && team.tasks[next] === "grey") {
        team.tasks[next] = "empty";
        team.taskStartTimes[next] = Date.now();
    }

    res.json({ success: `Drużyna ${team.name} rozwiązała zadanie ${taskNumber}` });
});

// Podsumowanie
app.get("/summary", (req, res) => {

    // ranking drużyn
    const teamSummary = teams.map(team => {
        let avgTime = 0;
        if (team.solves.length > 0) {
            const total = team.solves.reduce((a, s) => a + s.time, 0);
            avgTime = total / team.solves.length;
        }
        return {
            id: team.id,
            name: team.name,
            points: team.points,
            solved: team.solves.length,
            avgSeconds: Math.round(avgTime / 1000)
        };
    });

    // statystyki zadań
    const taskStats = [];
for (let i = 0; i < MAX_TASKS; i++) {
    const solvedBy = teams.filter(team => team.solves.some(s => s.task === i + 1));
    let avgTime = 0;
    if (solvedBy.length > 0) {
        const total = solvedBy.reduce((sum, team) => {
            const s = team.solves.find(s => s.task === i + 1);
            return sum + s.time; // czas w ms
        }, 0);
        avgTime = total / solvedBy.length / 1000; // konwersja na sekundy
    }
    taskStats.push({
        task: i + 1,
        solvedBy: solvedBy.length,
        avgSeconds: Math.round(avgTime)
    });
}

    const sortedTeams = [...teamSummary].sort((a, b) => b.points - a.points);

    res.json({
        teams: sortedTeams,
        tasks: taskStats
    });
});

app.listen(3000, () => console.log("Serwer działa na http://localhost:3000"));