

const axios = require('axios');

const API_URL = 'https://assessment.ksensetech.com/api';
const API_KEY = 'ak_11c519b5cd2de6e050dddf8a74f3bf2a44f1bc6330ed59f5';


const header = {
    'x-api-key': API_KEY
};

async function fetchPatientsRetry(page, limit=5, retries = 3, delay = 2000) {
    for (let attempt = 0; attempt <= retries; attempt++) {
    try {
        const response = await axios.get(`${API_URL}/patients`, {
            headers: header,
            params: {
                page,
                limit
            }
        });
        return response.data;
    } catch (error) {
       const status = error.response ? error.response.status : null;
         if (attempt < retries && (status === 429 || status >= 500)) {
            const retryAfter = error.response?.data?.retry_after || delay / 1000;
            const waitTime = retryAfter * 1000;
            await new Promise(resolve => setTimeout(resolve, waitTime));
            delay = Math.min(delay * 1.5, 10000);
            continue;
        }

        console.error('Error fetching patients:', error);
        throw error;
            }
        }
        console.log("Retry ALL");
    throw new Error("Retry attempts failed");
}

function bpRiskScore(bpScore) {
    if(!bpScore || typeof bpScore !== 'string' || !bpScore.includes('/'))
    {
        return 0;
    }

    const splitScores = bpScore.split('/');
    const systolic = parseInt(splitScores[0]);
    const diastolic = parseInt(splitScores[1]);

//START

    if(isNaN(systolic) || isNaN(diastolic))
    {
        return 0;
    }

    if (systolic < 120 && diastolic < 80) return 0;
    if (systolic >= 120 && systolic <= 129 && diastolic < 80) return 1;
    if (
    (systolic >= 130 && systolic <= 139) ||
    (diastolic >= 80 && diastolic <= 89)
    )
    return 2;
    if (systolic >= 140 || diastolic >= 90) return 3;
    
    return 0;
}

function tempRiskScore(temp) {
    if(typeof temp !== 'number' || isNaN(temp)) return 0;

    if (temp <= 99.5) return 0;
    if(temp >= 99.6 && temp <= 100.9) return 1;
    if(temp >= 101.0) return 2;
    
    return 0;

}

function ageRiskScore(age) {
    if(typeof age !== 'number' || isNaN(age)) return 0;

    if (age < 40) return 0;
    if (age >= 40 && age <= 65) return 1;
    if (age > 65) return 2;
    
    return 0;

}



function hasDataQualityIssues(patient) {

    const bp=patient.blood_pressure;
    const temp=patient.temperature;
    const age=patient.age;

    if (!bp || typeof bp !== 'string' || !bp.includes('/')) {
        return true;
    }
    const [systolicStr, diastolicStr] = bp.split('/');
    if (isNaN(parseInt(systolicStr)) || isNaN(parseInt(diastolicStr))) {
        return true; 
    }

    if(temp===undefined || typeof temp !=='number' || temp===null){
        return true;
    }
    if(age===undefined || typeof age !=='number' || age===null){
        return true;    
    }

    return false;

};

async function getAllPatients() {
  const patients = [];
  let page = 1;

  while (true) {
    const response = await fetchPatientsRetry(page,5);
    
    patients.push(...response.data);
    if (!response.pagination.hasNext) break;
    page++;

    // await new Promise(resolve=> setTimeout(resolve,2000))
  }
  
  return patients;           
}

async function processPatients(patients){

    const highRisk=[];
    const fever=[];
    const qualityIssue=[];

    patients.forEach(patient=>{
        if(hasDataQualityIssues(patient)){
            qualityIssue.push(patient.patient_id)
            // return;
        }

        const bpScore=bpRiskScore(patient.blood_pressure)
        const tempScore=tempRiskScore(patient.temperature)
        const ageScore=ageRiskScore(patient.age)

        const totalScore=bpScore+tempScore+ageScore

        if(totalScore>=4){
            highRisk.push(patient.patient_id)
        }
        if(patient.temperature>=99.6){
            fever.push(patient.patient_id)
        }

    });

   return { high_risk_patients: highRisk, fever_patients: fever, data_quality_issues: qualityIssue };
}


async function submitAssessment(results) {
    try{
  const response = await axios.post(
    `${API_URL}/submit-assessment`,
    results,
    {headers: header}
  );
  
  const r = response.data.results;
  console.log('results:', r);
  return response;
} catch(error){
    console.log("error:",error.response || error.message)
    throw error;
}
}

async function main() {
  try {

    const patients = await getAllPatients();
    const results = await processPatients(patients);
    await submitAssessment(results);
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

main();