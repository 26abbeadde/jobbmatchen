// Inställningar, ordlistor och synonymer som används i hela appen.

export const SEARCH_API = 'https://jobsearch.api.jobtechdev.se/search';
export const LINKS_API = 'https://links.api.jobtechdev.se/joblinks';
export const TAXONOMY_API = 'https://taxonomy.api.jobtechdev.se/v1/taxonomy/graphql';
export const GEOCODE_API = 'https://nominatim.openstreetmap.org/search';
export const SCB_SALARY_TABLE = 'https://api.scb.se/OV0104/v1/doris/sv/ssd/AM/AM0110/AM0110A/LoneSpridSektYrk4AN';
export const RESROBOT_API = 'https://api.resrobot.se/v2.1/trip';
export const SDK_URL = 'https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@0.133.0/+esm';
export const PDFJS_BASE = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';
export const MAMMOTH_URL = 'https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js';
export const TESSERACT_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
export const AI_MODEL = 'claude-opus-5-5';

export const DAYS = 7;
export const BASE_PAGES = 3;              // 3 x 100 senaste annonserna för valda roller
export const LINKS_PAGES = 2;             // annonser från andra jobbsajter
export const MAX_TERM_QUERIES = 10;       // extra fritextsökningar per nyckelord/verktyg
export const PAGE_SIZE = 25;              // annonser som visas åt gången
export const WATCH_INTERVAL = 30 * 60 * 1000;
export const DEADLINE_SOON_DAYS = 3;

// Viktning: det du själv skrivit väger tyngst. En träff i rubriken eller i
// annonsens kravdel väger extra.
export const WEIGHT = { kw: 3, tool: 3, cv: 1 };
export const HEADLINE_BOOST = 1.5;
export const REQUIREMENT_BOOST = 1.3;
export const CV_TERM_CAP = 8;

// Vanliga verktyg, system och kompetenser som letas upp i CV:t. Ord som börjar
// med versal (produktnamn) matchas skiftlägeskänsligt, övriga oavsett skiftläge.
export const SKILL_DICTIONARY = [
  // Kontor & affärssystem
  'Excel', 'Word', 'PowerPoint', 'Outlook', 'Office 365', 'Microsoft 365', 'Teams', 'SharePoint', 'OneDrive',
  'Google Workspace', 'Power BI', 'Tableau', 'Qlik', 'Qlik Sense', 'SAP', 'SAP S/4HANA', 'Oracle', 'Visma',
  'Fortnox', 'Hogia', 'Monitor ERP', 'Microsoft Dynamics', 'Dynamics 365', 'Business Central', 'Navision',
  'Salesforce', 'HubSpot', 'Lime CRM', 'Pipedrive', 'Jira', 'Confluence', 'Trello', 'Asana', 'Notion',
  'Workday', 'Agda', 'Heroma', 'Personec', 'Raindance', 'Unit4', 'Agresso', 'IFS', 'Jeeves', 'Pyramid',
  'Mailchimp', 'Google Analytics', 'Google Ads', 'Meta Ads', 'SEO', 'SEM', 'WordPress', 'Shopify', 'Magento',
  'Adobe Photoshop', 'Photoshop', 'Illustrator', 'InDesign', 'Premiere Pro', 'After Effects', 'Lightroom',
  'Figma', 'Sketch', 'Canva', 'Final Cut',
  // IT & utveckling
  'Python', 'Java', 'JavaScript', 'TypeScript', 'C#', 'C++', 'Golang', 'Rust', 'Kotlin', 'Swift',
  'PHP', 'Ruby', 'Scala', 'MATLAB', 'SQL', 'T-SQL', 'PL/SQL', 'PostgreSQL', 'MySQL', 'SQL Server',
  'MongoDB', 'Redis', 'Elasticsearch', 'Kafka', 'Spark', 'Databricks', 'Snowflake', 'dbt', 'Airflow',
  'React', 'Angular', 'Vue', 'Next.js', 'Node.js', '.NET', 'ASP.NET', 'Spring', 'Spring Boot', 'Django',
  'Flask', 'FastAPI', 'HTML', 'CSS', 'Tailwind', 'GraphQL', 'REST', 'API', 'Git', 'GitHub', 'GitLab',
  'Azure', 'AWS', 'GCP', 'Google Cloud', 'Docker', 'Kubernetes', 'Terraform', 'Ansible', 'Jenkins',
  'CI/CD', 'DevOps', 'Linux', 'Windows Server', 'Active Directory', 'Entra ID', 'Intune', 'SCCM',
  'VMware', 'Hyper-V', 'Citrix', 'PowerShell', 'Bash', 'ServiceNow', 'TOPdesk', 'ITIL', 'Cisco',
  'Fortinet', 'Palo Alto', 'Wireshark', 'Splunk', 'SIEM', 'ISO 27001', 'Machine Learning', 'AI',
  'TensorFlow', 'PyTorch', 'Scrum', 'Kanban', 'Agile', 'SAFe', 'Selenium', 'Cypress', 'Playwright',
  'iOS', 'Android', 'Flutter', 'React Native', 'Unity', 'Unreal Engine', 'PLC', 'Siemens',
  'AutoCAD', 'Revit', 'SolidWorks', 'Catia', 'Inventor', 'ArchiCAD', 'Tekla', 'BIM', 'GIS', 'ArcGIS',
  'Creo', 'Ansys', 'LabVIEW',
  // Ekonomi, HR, inköp, logistik
  'bokföring', 'redovisning', 'bokslut', 'årsredovisning', 'löneadministration', 'lönehantering',
  'kundreskontra', 'leverantörsreskontra', 'moms', 'budget', 'controlling', 'IFRS', 'K3', 'revision',
  'rekrytering', 'arbetsrätt', 'kompetensbaserad rekrytering', 'upphandling', 'LOU', 'inköp',
  'Lean', 'Six Sigma', 'Kaizen', '5S', 'WMS', 'lagerhantering', 'truckkort', 'truckkort A', 'truckkort B',
  'motviktstruck', 'skjutstativtruck', 'ledstaplare', 'plocktruck', 'traverskort', 'ADR', 'YKB',
  'B-körkort', 'C-körkort', 'CE-körkort', 'D-körkort', 'körkort B', 'körkort C', 'körkort CE', 'hjullastare',
  'grävmaskin', 'liftkort', 'heta arbeten', 'säker vatten', 'ID06', 'elbehörighet', 'ESA',
  'svetsning', 'MIG', 'TIG', 'CNC', 'svarvning', 'fräsning', 'ritningsläsning', 'kvalitetskontroll',
  'ISO 9001', 'ISO 14001', 'projektledning', 'Prince2', 'PMP', 'kundservice', 'försäljning', 'B2B', 'B2C',
  'kassa', 'visual merchandising',
  // Vård, omsorg, skola
  'Cosmic', 'TakeCare', 'Melior', 'Procapita', 'Lifecare', 'Treserva', 'Pascal', 'NPÖ', 'journalföring',
  'delegering', 'läkemedelshantering', 'sjuksköterskelegitimation', 'förskollärarlegitimation',
  'lärarlegitimation', 'undersköterska', 'HLR', 'demensvård', 'palliativ vård', 'psykiatri', 'LSS', 'SoL',
  'KBT', 'lågaffektivt bemötande', 'NPF', 'Unikum', 'Skolon', 'Google Classroom', 'Vklass',
  // Hotell & restaurang
  'hygienpass', 'HACCP', 'serveringstillstånd', 'barista', 'à la carte', 'Opera PMS', 'Mews',
  // Språk
  'engelska', 'tyska', 'franska', 'spanska', 'arabiska', 'finska', 'norska', 'danska',
];

// Ord som betyder samma sak. Kompletteras med synonymer från
// Arbetsförmedlingens kompetensregister när det har laddats.
export const SYNONYM_GROUPS = [
  ['excel', 'ms excel', 'microsoft excel', 'kalkylprogram', 'kalkylark'],
  ['microsoft 365', 'office 365', 'm365', 'ms office', 'office-paketet', 'officepaketet'],
  ['javascript', 'js'], ['c#', 'csharp', 'c sharp'], ['.net', 'dotnet'], ['node.js', 'nodejs'],
  ['power bi', 'powerbi'], ['postgresql', 'postgres'], ['sql server', 'mssql', 'ms sql'],
  ['kubernetes', 'k8s'], ['aws', 'amazon web services'], ['gcp', 'google cloud'], ['azure', 'microsoft azure'],
  ['ai', 'artificiell intelligens', 'artificial intelligence'], ['machine learning', 'maskininlärning'],
  ['frontend', 'front-end', 'front end'], ['backend', 'back-end', 'back end'], ['fullstack', 'full-stack', 'full stack'],
  ['ux', 'användarupplevelse', 'user experience'],
  ['it-support', 'helpdesk', 'servicedesk', 'service desk', 'it support'],
  ['kundservice', 'kundtjänst', 'customer service', 'kundsupport'],
  ['projektledning', 'projektledare', 'project management', 'project manager'],
  ['b-körkort', 'körkort b', 'b-kort', 'körkort'], ['c-körkort', 'körkort c'], ['ce-körkort', 'körkort ce'],
  ['truckkort', 'truckkörkort', 'truckbehörighet', 'truckutbildning'],
  ['undersköterska', 'usk'], ['sjuksköterska', 'ssk'],
  ['svetsning', 'svetsare'], ['lager', 'lagerarbete', 'lagerarbetare', 'lagerhantering'],
  ['engelska', 'english'], ['svenska', 'swedish'],
  ['distans', 'remote', 'distansarbete', 'hemifrån'],
  ['junior', 'nyexaminerad', 'entry level', 'entry-level'],
  ['säljare', 'försäljning', 'sales'], ['inköp', 'inköpare', 'procurement'],
  ['rekrytering', 'rekryterare', 'recruitment'], ['löneadministration', 'lönehantering', 'payroll'],
  ['hr', 'human resources'],
];

export const STOPWORDS = new Set((
  'och i att det som en på är av för med till den har de inte om ett han men var jag sig från vi så kan man när år ' +
  'säger hon under också efter eller nu sin där vid mot ska skulle kommer ut får finns vara hade alla andra mycket än här ' +
  'då sedan över bara in blir upp även vad få två vill ha många hur mer går sverige kronor detta nya procent ' +
  'skriver hans utan vår våra vårt ditt din dina du ni er era oss mig min mina mitt dig dem deras hennes ' +
  'the and for with you your our are this that from have will can all who about more work team role ' +
  'erfarenhet arbete arbetet jobb jobba tjänst tjänsten företag företaget kund kunder ansvar ansvarig ' +
  'januari februari mars april maj juni juli augusti september oktober november december ' +
  'måndag tisdag onsdag torsdag fredag lördag söndag stockholm göteborg malmö uppsala sweden svensk ' +
  'cv profil kontakt adress telefon mail email e-post referenser referens utbildning anställning ' +
  'nuvarande tidigare kompetens kompetenser kunskap kunskaper personligt personliga egenskaper ' +
  'ansvarade arbetade jobbade genomförde ledde nivå mycket god goda grundläggande avancerad ' +
  'gymnasium gymnasieskola högskola universitet examen program kurs kurser intressen hobbies ' +
  'lead senior junior manager specialist assistant ab hb kb inc ltd gmbh språk språkkunskaper ' +
  'färdigheter certifikat certifieringar övrigt sammanfattning om arbetslivserfarenhet ' +
  'söker sökes vill nytt ny till inom hos oss dig'
).split(/\s+/));
