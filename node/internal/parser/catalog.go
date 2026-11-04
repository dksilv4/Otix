package parser

import "regexp"

type CanonicalEntry struct {
	Title   string
	Clean   string
	Year    string
	Edition string
}

type EditionDef struct {
	Pattern *regexp.Regexp
	Name    string
}

var (
	SceneGroups = []string{"CODEX", "FLT", "RUNE", "EMPRESS", "TENOKE", "PROPHET", "RELOADED", "SKIDROW"}
	RepackGroups = []string{"FitGirl", "DODI", "ElAmigos"}

	EditionPatterns = []EditionDef{
		{Pattern: regexp.MustCompile(`(?i)(?:[-_.]|\b)goty(?:\s+edition|\.edition)?\b`), Name: "GOTY Edition"},
		{Pattern: regexp.MustCompile(`(?i)(?:[-_.]|\b)special(?:\s+edition|\.edition)\b`), Name: "Special Edition"},
		{Pattern: regexp.MustCompile(`(?i)(?:[-_.]|\b)directors?\.?cut\b`), Name: "Director's Cut"},
		{Pattern: regexp.MustCompile(`(?i)(?:[-_.]|\b)ultimate(?:\s+edition|\.edition)?\b`), Name: "Ultimate Edition"},
		{Pattern: regexp.MustCompile(`(?i)(?:[-_.]|\b)complete(?:\s+edition|\.edition)?\b`), Name: "Complete Edition"},
		{Pattern: regexp.MustCompile(`(?i)(?:[-_.]|\b)premium(?:\s+edition|\.edition)?\b`), Name: "Premium Edition"},
		{Pattern: regexp.MustCompile(`(?i)(?:[-_.]|\b)royal(?:\s+edition|\.edition)?\b`), Name: "Royal Edition"},
		{Pattern: regexp.MustCompile(`(?i)(?:[-_.]|\b)legendary(?:\s+edition|\.edition)?\b`), Name: "Legendary Edition"},
		{Pattern: regexp.MustCompile(`(?i)(?:[-_.]|\b)remastered(?:\s+edition|\.edition)?\b`), Name: "Remastered Edition"},
	}

	CanonicalGames = map[string]CanonicalEntry{
		"the witcher 3 wild hunt":             {Title: "The Witcher 3: Wild Hunt", Clean: "the witcher 3 wild hunt", Year: "2015"},
		"cyberpunk 2077 phantom liberty":      {Title: "Cyberpunk 2077: Phantom Liberty", Clean: "cyberpunk 2077 phantom liberty", Year: "2023"},
		"cyberpunk 2077":                      {Title: "Cyberpunk 2077", Clean: "cyberpunk 2077", Year: "2020"},
		"hogwarts legacy":                     {Title: "Hogwarts Legacy", Clean: "hogwarts legacy", Year: "2023"},
		"elden ring shadow of the erdtree":    {Title: "Elden Ring: Shadow of the Erdtree", Clean: "elden ring shadow of the erdtree", Year: "2024"},
		"elden ring":                          {Title: "Elden Ring", Clean: "elden ring", Year: "2022"},
		"starfield":                           {Title: "Starfield", Clean: "starfield", Year: "2023"},
		"baldurs gate 3":                      {Title: "Baldur's Gate 3", Clean: "baldurs gate 3", Year: "2023"},
		"grand theft auto v":                  {Title: "Grand Theft Auto V", Clean: "grand theft auto v", Year: "2015"},
		"resident evil 4":                     {Title: "Resident Evil 4", Clean: "resident evil 4", Year: "2023"},
		"dead island 2":                       {Title: "Dead Island 2", Clean: "dead island 2", Year: "2023"},
		"armored core vi fires of rubicon":    {Title: "Armored Core VI: Fires of Rubicon", Clean: "armored core vi fires of rubicon", Year: "2023"},
		"armored core vi":                     {Title: "Armored Core VI: Fires of Rubicon", Clean: "armored core vi fires of rubicon", Year: "2023"},
		"alan wake 2":                         {Title: "Alan Wake 2", Clean: "alan wake 2", Year: "2023"},
		"ghost of tsushima":                   {Title: "Ghost of Tsushima", Clean: "ghost of tsushima", Year: "2024"},
		"red dead redemption 2":               {Title: "Red Dead Redemption 2", Clean: "red dead redemption 2", Year: "2019"},
		"forza horizon 5":                     {Title: "Forza Horizon 5", Clean: "forza horizon 5", Year: "2021"},
		"sekiro shadows die twice":            {Title: "Sekiro: Shadows Die Twice", Clean: "sekiro shadows die twice", Year: "2020"},
		"doom eternal":                        {Title: "DOOM Eternal", Clean: "doom eternal", Year: "2020"},
		"control":                             {Title: "Control", Clean: "control", Year: "2020"},
		"half life 2":                         {Title: "Half-Life 2", Clean: "half life 2", Year: "2004"},
		"portal 2":                            {Title: "Portal 2", Clean: "portal 2", Year: "2011"},
		"crysis 3":                            {Title: "Crysis 3", Clean: "crysis 3", Year: "2013"},
		"dark souls iii the ringed city":      {Title: "Dark Souls III: The Ringed City", Clean: "dark souls iii the ringed city", Year: "2017"},
		"death stranding":                     {Title: "Death Stranding", Clean: "death stranding", Year: "2022"},
		"god of war":                          {Title: "God of War", Clean: "god of war", Year: "2022"},
		"horizon zero dawn":                   {Title: "Horizon Zero Dawn", Clean: "horizon zero dawn", Year: "2020"},
		"mortal kombat 11":                    {Title: "Mortal Kombat 11", Clean: "mortal kombat 11", Year: "2020"},
		"final fantasy vii remake intergrade": {Title: "Final Fantasy VII Remake Intergrade", Clean: "final fantasy vii remake intergrade", Year: "2022"},
		"the last of us part i":               {Title: "The Last of Us Part I", Clean: "the last of us part i", Year: "2023"},
		"metal gear solid v the phantom pain": {Title: "Metal Gear Solid V: The Phantom Pain", Clean: "metal gear solid v the phantom pain", Year: "2015"},
		"monster hunter world":                {Title: "Monster Hunter: World", Clean: "monster hunter world", Year: "2018"},
		"kingdom come deliverance":            {Title: "Kingdom Come: Deliverance", Clean: "kingdom come deliverance", Year: "2019"},
		"fallout 4":                           {Title: "Fallout 4", Clean: "fallout 4", Year: "2017"},
		"skyrim":                              {Title: "The Elder Scrolls V: Skyrim", Clean: "the elder scrolls v skyrim", Year: "2016"},
		"the elder scrolls v skyrim":          {Title: "The Elder Scrolls V: Skyrim", Clean: "the elder scrolls v skyrim", Year: "2016"},
		"resident evil village":               {Title: "Resident Evil Village", Clean: "resident evil village", Year: "2021"},
		"dragon age inquisition":              {Title: "Dragon Age: Inquisition", Clean: "dragon age inquisition", Year: "2015"},
		"mass effect legendary edition":       {Title: "Mass Effect Legendary Edition", Clean: "mass effect legendary edition", Year: "2021"},
		"assassins creed valhalla":            {Title: "Assassin's Creed Valhalla", Clean: "assassins creed valhalla", Year: "2020"},
		"marvels spider man remastered":       {Title: "Marvel's Spider-Man Remastered", Clean: "marvels spider man remastered", Year: "2022"},
		"persona 5 royal":                     {Title: "Persona 5 Royal", Clean: "persona 5 royal", Year: "2022"},
		"tekken 8":                            {Title: "Tekken 8", Clean: "tekken 8", Year: "2024"},
		"lies of p":                           {Title: "Lies of P", Clean: "lies of p", Year: "2023"},
		"dragon age the veilguard":            {Title: "Dragon Age: The Veilguard", Clean: "dragon age the veilguard", Year: "2024"},
		"dead space":                          {Title: "Dead Space", Clean: "dead space", Year: "2023"},
		"super mario bros":                    {Title: "Super Mario Bros.", Clean: "super mario bros", Year: "1985"},
		"the legend of zelda":                 {Title: "The Legend of Zelda", Clean: "the legend of zelda", Year: "1987"},
		"metroid":                             {Title: "Metroid", Clean: "metroid", Year: "1987"},
		"mega man 2":                          {Title: "Mega Man 2", Clean: "mega man 2", Year: "1989"},
		"super mario world":                   {Title: "Super Mario World", Clean: "super mario world", Year: "1991"},
		"chrono trigger":                      {Title: "Chrono Trigger", Clean: "chrono trigger", Year: "1995"},
		"the legend of zelda a link to the past": {Title: "The Legend of Zelda: A Link to the Past", Clean: "the legend of zelda a link to the past", Year: "1992"},
		"super metroid":                       {Title: "Super Metroid", Clean: "super metroid", Year: "1994"},
		"super mario 64":                      {Title: "Super Mario 64", Clean: "super mario 64", Year: "1996"},
		"the legend of zelda ocarina of time": {Title: "The Legend of Zelda: Ocarina of Time", Clean: "the legend of zelda ocarina of time", Year: "1998"},
		"goldeneye 007":                       {Title: "GoldenEye 007", Clean: "goldeneye 007", Year: "1997"},
		"banjo kazooie":                       {Title: "Banjo-Kazooie", Clean: "banjo kazooie", Year: "1998"},
		"super smash bros melee":              {Title: "Super Smash Bros. Melee", Clean: "super smash bros melee", Year: "2001"},
		"the legend of zelda the wind waker":  {Title: "The Legend of Zelda: The Wind Waker", Clean: "the legend of zelda the wind waker", Year: "2003"},
		"metroid prime":                       {Title: "Metroid Prime", Clean: "metroid prime", Year: "2002"},
		"mario kart double dash":              {Title: "Mario Kart: Double Dash!!", Clean: "mario kart double dash", Year: "2003"},
		"super mario galaxy":                  {Title: "Super Mario Galaxy", Clean: "super mario galaxy", Year: "2007"},
		"the legend of zelda twilight princess": {Title: "The Legend of Zelda: Twilight Princess", Clean: "the legend of zelda twilight princess", Year: "2006"},
		"xenoblade chronicles":                {Title: "Xenoblade Chronicles", Clean: "xenoblade chronicles", Year: "2012"},
		"super smash bros brawl":              {Title: "Super Smash Bros. Brawl", Clean: "super smash bros brawl", Year: "2008"},
		"super mario odyssey":                 {Title: "Super Mario Odyssey", Clean: "super mario odyssey", Year: "2017"},
		"the legend of zelda breath of the wild": {Title: "The Legend of Zelda: Breath of the Wild", Clean: "the legend of zelda breath of the wild", Year: "2017"},
		"metroid dread":                       {Title: "Metroid Dread", Clean: "metroid dread", Year: "2021"},
		"super smash bros ultimate":           {Title: "Super Smash Bros. Ultimate", Clean: "super smash bros ultimate", Year: "2018"},
		"castlevania symphony of the night":   {Title: "Castlevania: Symphony of the Night", Clean: "castlevania symphony of the night", Year: "1997"},
		"final fantasy vii":                   {Title: "Final Fantasy VII", Clean: "final fantasy vii", Year: "1997"},
		"metal gear solid":                    {Title: "Metal Gear Solid", Clean: "metal gear solid", Year: "1998"},
		"crash bandicoot":                     {Title: "Crash Bandicoot", Clean: "crash bandicoot", Year: "1996"},
		"shadow of the colossus":              {Title: "Shadow of the Colossus", Clean: "shadow of the colossus", Year: "2005"},
		"grand theft auto san andreas":        {Title: "Grand Theft Auto: San Andreas", Clean: "grand theft auto san andreas", Year: "2004"},
		"metal gear solid 3 snake eater":      {Title: "Metal Gear Solid 3: Snake Eater", Clean: "metal gear solid 3 snake eater", Year: "2004"},
		"silent hill 2":                       {Title: "Silent Hill 2", Clean: "silent hill 2", Year: "2001"},
		"demons souls":                        {Title: "Demon's Souls", Clean: "demons souls", Year: "2009"},
		"metal gear solid 4 guns of the patriots": {Title: "Metal Gear Solid 4: Guns of the Patriots", Clean: "metal gear solid 4 guns of the patriots", Year: "2008"},
		"the last of us":                      {Title: "The Last of Us", Clean: "the last of us", Year: "2013"},
		"god of war iii":                      {Title: "God of War III", Clean: "god of war iii", Year: "2010"},
		"crisis core final fantasy vii":       {Title: "Crisis Core: Final Fantasy VII", Clean: "crisis core final fantasy vii", Year: "2008"},
		"god of war chains of olympus":        {Title: "God of War: Chains of Olympus", Clean: "god of war chains of olympus", Year: "2008"},
		"monster hunter freedom unite":        {Title: "Monster Hunter Freedom Unite", Clean: "monster hunter freedom unite", Year: "2009"},
		"persona 3 portable":                  {Title: "Persona 3 Portable", Clean: "persona 3 portable", Year: "2010"},
		"shenmue":                             {Title: "Shenmue", Clean: "shenmue", Year: "2000"},
		"crazy taxi":                          {Title: "Crazy Taxi", Clean: "crazy taxi", Year: "2000"},
		"sonic adventure":                     {Title: "Sonic Adventure", Clean: "sonic adventure", Year: "1999"},
		"jet grind radio":                     {Title: "Jet Grind Radio", Clean: "jet grind radio", Year: "2000"},
	}
)
