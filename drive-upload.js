// Google Drive Picker & Upload Integration
// Consule Solutions - NetSuite Discovery Forms

const GOOGLE_CLIENT_ID = '270115083105-4e9s8e3rnsia2m7eha0nu5qalugm3l65.apps.googleusercontent.com';
const GOOGLE_API_KEY = 'AIzaSyAIXZhDT5tJRk0i3Kbe_HMcbvZpG1Ma_rI';
const SCOPES = 'https://www.googleapis.com/auth/drive.file';
const DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest';

let tokenClient;
let accessToken = null;
let gapiInited = false;
let gisInited = false;

// Load Google API client
function gapiLoaded() {
  gapi.load('client:picker', initGapiClient);
}

async function initGapiClient() {
  await gapi.client.init({
    apiKey: GOOGLE_API_KEY,
    discoveryDocs: [DISCOVERY_DOC],
  });
  gapiInited = true;
  maybeEnableDriveButton();
}

// Load Google Identity Services
function gisLoaded() {
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: GOOGLE_CLIENT_ID,
    scope: SCOPES,
    callback: '', // defined at request time
  });
  gisInited = true;
  maybeEnableDriveButton();
}

function maybeEnableDriveButton() {
  if (gapiInited && gisInited) {
    const btn = document.getElementById('btnDrive');
    if (btn) {
      btn.disabled = false;
      btn.title = 'Save to Google Drive';
    }
  }
}

// Main function: Save to Google Drive
function saveToDrive() {
  const btn = document.getElementById('btnDrive');
  const originalText = btn.innerHTML;
  btn.innerHTML = '<span class="drive-icon">📁</span> Connecting...';
  btn.disabled = true;

  tokenClient.callback = async (response) => {
    if (response.error) {
      btn.innerHTML = originalText;
      btn.disabled = false;
      showToast('Authentication failed. Please try again.', 'error');
      return;
    }
    accessToken = response.access_token;
    btn.innerHTML = '<span class="drive-icon">📁</span> Choose folder...';
    createPicker();
  };

  if (accessToken === null) {
    tokenClient.requestAccessToken({ prompt: 'consent' });
  } else {
    tokenClient.requestAccessToken({ prompt: '' });
  }
}

function createPicker() {
  const picker = new google.picker.PickerBuilder()
    .setTitle('Select a folder to save the discovery document')
    .addView(new google.picker.DocsView()
      .setIncludeFolders(true)
      .setSelectFolderEnabled(true)
      .setMimeTypes('application/vnd.google-apps.folder'))
    .setOAuthToken(accessToken)
    .setDeveloperKey(GOOGLE_API_KEY)
    .setCallback(pickerCallback)
    .build();
  picker.setVisible(true);
}

async function pickerCallback(data) {
  const btn = document.getElementById('btnDrive');

  if (data.action === google.picker.Action.CANCEL) {
    btn.innerHTML = '<span class="drive-icon">📁</span> Save to Google Drive';
    btn.disabled = false;
    return;
  }

  if (data.action === google.picker.Action.PICKED) {
    const folderId = data.docs[0].id;
    const folderName = data.docs[0].name;
    btn.innerHTML = '<span class="drive-icon">📁</span> Uploading...';

    try {
      // Generate the Excel file as array buffer
      const wb = generateWorkbook();
      const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

      const clientName = document.querySelector('[data-export="Client Name"]')?.value || 'Client';
      const date = new Date().toISOString().split('T')[0];
      const formName = document.querySelector('.header h1')?.textContent?.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '-') || 'Discovery';
      const fileName = `${clientName}_${formName}_${date}.xlsx`;

      // Upload to Google Drive
      const metadata = {
        name: fileName,
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        parents: [folderId]
      };

      const form = new FormData();
      form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
      form.append('file', blob);

      const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink', {
        method: 'POST',
        headers: new Headers({ 'Authorization': 'Bearer ' + accessToken }),
        body: form
      });

      const result = await response.json();

      if (result.id) {
        btn.innerHTML = '<span class="drive-icon">✅</span> Saved!';
        showToast(`Saved "${fileName}" to "${folderName}" in Google Drive!`, 'success');

        // Show link to file
        if (result.webViewLink) {
          setTimeout(() => {
            const openFile = confirm(`File saved successfully!\n\nWould you like to open it in Google Drive?`);
            if (openFile) {
              window.open(result.webViewLink, '_blank');
            }
          }, 500);
        }
      } else {
        throw new Error(result.error?.message || 'Upload failed');
      }
    } catch (err) {
      console.error('Drive upload error:', err);
      showToast('Upload failed: ' + err.message, 'error');
    }

    setTimeout(() => {
      btn.innerHTML = '<span class="drive-icon">📁</span> Save to Google Drive';
      btn.disabled = false;
    }, 3000);
  }
}

// Generate workbook from form data (called by each form)
function generateWorkbook() {
  const data = [];
  const sections = document.querySelectorAll('.section, .meta-section');
  sections.forEach(section => {
    const sectionTitle = section.querySelector('h2')?.textContent || '';
    const fields = section.querySelectorAll('.field');
    fields.forEach(field => {
      const label = field.querySelector('label')?.textContent?.replace(' *', '') || '';
      let value = '';
      const input = field.querySelector('input[type="text"], input[type="number"], input[type="date"], select, textarea');
      if (input) { value = input.value; }
      const checkedRadio = field.querySelector('input[type="radio"]:checked');
      if (checkedRadio) { value = checkedRadio.value; }
      const checkedBoxes = field.querySelectorAll('input[type="checkbox"]:checked');
      if (checkedBoxes.length > 0) { value = Array.from(checkedBoxes).map(c => c.value).join(', '); }
      data.push({ 'Section': sectionTitle, 'Question': label, 'Response': value });
    });
  });
  const ws = XLSX.utils.json_to_sheet(data);
  ws['!cols'] = [{ wch: 30 }, { wch: 60 }, { wch: 60 }];
  const wb = XLSX.utils.book_new();
  const sheetName = document.querySelector('.header h1')?.textContent?.substring(0, 31) || 'Discovery';
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  return wb;
}

// Enhanced toast notification
function showToast(message, type) {
  const t = document.getElementById('toast');
  t.textContent = message;
  t.style.background = type === 'error' ? '#ef4444' : '#10b981';
  t.style.display = 'block';
  setTimeout(() => t.style.display = 'none', 4000);
}
