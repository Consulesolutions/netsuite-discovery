// Google Drive Picker & Upload Integration
// Consule Solutions - NetSuite Discovery Forms

const GOOGLE_CLIENT_ID = '270115083105-4e9s8e3rnsia2m7eha0nu5qalugm3l65.apps.googleusercontent.com';
const GOOGLE_API_KEY = 'AIzaSyAIXZhDT5tJRk0i3Kbe_HMcbvZpG1Ma_rI';
const SCOPES = 'https://www.googleapis.com/auth/drive.file';

let tokenClient;
let accessToken = null;
let gapiInited = false;
let gisInited = false;

// Load Google API client — only load Picker (skip client library)
function gapiLoaded() {
  console.log('[Drive] gapi script loaded, loading picker...');
  gapi.load('picker', {
    callback: function() {
      console.log('[Drive] Picker library loaded successfully');
      gapiInited = true;
      maybeEnableDriveButton();
    },
    onerror: function() {
      console.error('[Drive] Failed to load Picker library');
      showDriveError('Failed to load Google Picker');
    }
  });
}

// Load Google Identity Services
function gisLoaded() {
  console.log('[Drive] GIS script loaded, initializing token client...');
  try {
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: SCOPES,
      callback: '', // defined at request time
    });
    gisInited = true;
    console.log('[Drive] Token client initialized successfully');
    maybeEnableDriveButton();
  } catch(e) {
    console.error('[Drive] Failed to init token client:', e);
    showDriveError('Failed to initialize Google auth');
  }
}

function maybeEnableDriveButton() {
  console.log('[Drive] Check ready: gapi=' + gapiInited + ', gis=' + gisInited);
  if (gapiInited && gisInited) {
    const btn = document.getElementById('btnDrive');
    if (btn) {
      btn.disabled = false;
      btn.title = 'Save to Google Drive';
      btn.innerHTML = '<span class="drive-icon">📁</span> Save to Google Drive';
      console.log('[Drive] Button enabled!');
    }
  }
}

function showDriveError(msg) {
  const btn = document.getElementById('btnDrive');
  if (btn) {
    btn.innerHTML = '<span class="drive-icon">⚠️</span> ' + msg;
    btn.disabled = true;
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
      console.error('[Drive] Auth error:', response);
      btn.innerHTML = originalText;
      btn.disabled = false;
      showToast('Authentication failed: ' + response.error, 'error');
      return;
    }
    accessToken = response.access_token;
    console.log('[Drive] Got access token, opening picker...');
    btn.innerHTML = '<span class="drive-icon">📁</span> Choose folder...';
    createPicker();
  };

  tokenClient.error_callback = (err) => {
    console.error('[Drive] Token error:', err);
    btn.innerHTML = originalText;
    btn.disabled = false;
    if (err.type === 'popup_closed') {
      showToast('Sign-in window was closed. Try again.', 'error');
    } else {
      showToast('Authentication error. Try again.', 'error');
    }
  };

  if (accessToken === null) {
    tokenClient.requestAccessToken({ prompt: 'consent' });
  } else {
    tokenClient.requestAccessToken({ prompt: '' });
  }
}

function createPicker() {
  const view = new google.picker.DocsView(google.picker.ViewId.FOLDERS)
    .setIncludeFolders(true)
    .setSelectFolderEnabled(true);

  const picker = new google.picker.PickerBuilder()
    .setTitle('Select a folder to save the discovery document')
    .addView(view)
    .enableFeature(google.picker.Feature.NAV_HIDDEN)
    .setOAuthToken(accessToken)
    .setDeveloperKey(GOOGLE_API_KEY)
    .setCallback(pickerCallback)
    .setOrigin(window.location.origin)
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

      // Upload to Google Drive using multipart upload
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

        if (result.webViewLink) {
          setTimeout(() => {
            const openFile = confirm('File saved successfully!\n\nWould you like to open it in Google Drive?');
            if (openFile) {
              window.open(result.webViewLink, '_blank');
            }
          }, 500);
        }
      } else {
        throw new Error(result.error?.message || 'Upload failed');
      }
    } catch (err) {
      console.error('[Drive] Upload error:', err);
      showToast('Upload failed: ' + err.message, 'error');
    }

    setTimeout(() => {
      btn.innerHTML = '<span class="drive-icon">📁</span> Save to Google Drive';
      btn.disabled = false;
    }, 3000);
  }
}

// Generate workbook from form data
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
  if (!t) return;
  t.textContent = message;
  t.style.background = type === 'error' ? '#ef4444' : '#10b981';
  t.style.display = 'block';
  setTimeout(() => t.style.display = 'none', 4000);
}
