// Admin Panel JavaScript
let currentOrders = [];
let editingOrderId = null;
let currentInvoiceData = null;
let invoiceItems = [];

// Wait for Firebase to be ready
let isFirebaseReady = false;
const waitForFirebase = () => {
    return new Promise((resolve) => {
        const checkFirebase = setInterval(() => {
            if (window.db && window.firestore) {
                clearInterval(checkFirebase);
                isFirebaseReady = true;
                console.log('Firebase ready!');
                resolve();
            }
        }, 100);
        
        setTimeout(() => {
            if (!isFirebaseReady) {
                clearInterval(checkFirebase);
                console.error('Firebase failed to initialize after 10 seconds');
                alert('Firebase gagal diinisialisasi. Pastikan Anda sudah mengisi firebaseConfig dengan benar.');
            }
        }, 10000);
    });
};

// DOM Elements
const adminDashboard = document.getElementById('adminDashboard');
const newOrderBtn = document.getElementById('newOrderBtn');
const orderFormModal = document.getElementById('orderFormModal');
const orderForm = document.getElementById('orderForm');
const orderFormClose = document.getElementById('orderFormClose');
const cancelFormBtn = document.getElementById('cancelFormBtn');
const ordersTableBody = document.getElementById('ordersTableBody');
const invoiceBuilderModal = document.getElementById('invoiceBuilderModal');
const invoiceBuilderClose = document.getElementById('invoiceBuilderClose');
const openInvoiceBuilderBtn = document.getElementById('openInvoiceBuilder');

// Event Listeners
newOrderBtn.addEventListener('click', () => openOrderForm());
orderFormClose.addEventListener('click', closeOrderForm);
cancelFormBtn.addEventListener('click', closeOrderForm);
orderForm.addEventListener('submit', handleOrderSubmit);
invoiceBuilderClose.addEventListener('click', closeInvoiceBuilder);
openInvoiceBuilderBtn.addEventListener('click', openInvoiceBuilder);

// Show/hide Google Drive link based on status
document.getElementById('formStatus').addEventListener('change', function() {
    const section = document.getElementById('googleDriveSection');
    if (this.value === 'Done') {
        section.style.display = 'block';
    } else {
        section.style.display = 'none';
    }
});

// Initialize
window.addEventListener('load', async () => {
    console.log('Page loaded, waiting for Firebase...');
    await waitForFirebase();
    
    if (!isFirebaseReady) {
        console.warn('Firebase not available, using localStorage instead');
        alert('⚠️ Firebase belum dikonfigurasi.\n\nAnda bisa:\n1. Setup Firebase (lihat README.md)\n2. Atau gunakan mode demo dengan localStorage (data hanya tersimpan di browser ini)');
    }
    
    loadOrders();
});

// Image Compression Function
function compressImage(file, maxSizeKB = 800) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = function(e) {
            const img = new Image();
            img.onload = function() {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;
                
                const maxDimension = 1200;
                if (width > height && width > maxDimension) {
                    height = (height * maxDimension) / width;
                    width = maxDimension;
                } else if (height > maxDimension) {
                    width = (width * maxDimension) / height;
                    height = maxDimension;
                }
                
                canvas.width = width;
                canvas.height = height;
                
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                
                let quality = 0.7;
                let result = canvas.toDataURL('image/jpeg', quality);
                
                while (result.length > maxSizeKB * 1024 * 1.37 && quality > 0.1) {
                    quality -= 0.1;
                    result = canvas.toDataURL('image/jpeg', quality);
                }
                
                console.log('Image compressed:', Math.round(result.length / 1024), 'KB');
                resolve(result);
            };
            img.onerror = reject;
            img.src = e.target.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

// Load Orders
async function loadOrders() {
    if (!isFirebaseReady) {
        console.log('Loading from localStorage...');
        const savedOrders = localStorage.getItem('orders');
        if (savedOrders) {
            currentOrders = JSON.parse(savedOrders);
        } else {
            currentOrders = [];
        }
        renderOrders();
        updateStats();
        return;
    }
    
    try {
        const querySnapshot = await window.firestore.getDocs(
            window.firestore.collection(window.db, 'orders')
        );
        
        currentOrders = [];
        querySnapshot.forEach((doc) => {
            currentOrders.push({ id: doc.id, ...doc.data() });
        });
        
        renderOrders();
        updateStats();
    } catch (error) {
        console.error('Error loading orders:', error);
        alert('Error loading orders. Check console for details.');
    }
}

// Render Orders Table
function renderOrders() {
    ordersTableBody.innerHTML = '';
    
    if (currentOrders.length === 0) {
        ordersTableBody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:40px; color:#999;">Belum ada order. Klik "New Order" untuk menambah.</td></tr>';
        return;
    }
    
    currentOrders.forEach(order => {
        let displayPrice = order.totalPrice;
        if (order.invoiceData && order.invoiceData.items) {
            displayPrice = order.invoiceData.items.reduce((total, item) => {
                return total + ((item.price * item.quantity) - (item.discount || 0));
            }, 0);
        }
        
        // Status konfirmasi client
        let confirmationStatus = '';
        if (order.status === 'Done') {
            if (order.clientConfirmed) {
                confirmationStatus = '<span style="color: #4caf50; font-weight: 600;">✅ Dikonfirmasi</span>';
            } else {
                confirmationStatus = '<span style="color: #ff9800; font-weight: 600;">⏳ Menunggu</span>';
            }
        } else {
            confirmationStatus = '<span style="color: #999;">-</span>';
        }
        
        const row = document.createElement('tr');
        row.innerHTML = `
            <td><strong>${order.orderCode}</strong></td>
            <td>${order.clientName}</td>
            <td><span class="status-badge ${getStatusClass(order.status)}">${order.status}</span></td>
            <td>${confirmationStatus}</td>
            <td>${formatCurrency(displayPrice)}</td>
            <td>
                <button class="btn-edit" onclick="editOrder('${order.id}')">Edit</button>
                <button class="btn-delete" onclick="deleteOrder('${order.id}')">Delete</button>
            </td>
        `;
        ordersTableBody.appendChild(row);
    });
}

// Update Stats
function updateStats() {
    const waiting = currentOrders.filter(o => o.status === 'Waiting Payment').length;
    const progress = currentOrders.filter(o => o.status === 'In Progress').length;
    const done = currentOrders.filter(o => o.status === 'Done').length;
    const needConfirmation = currentOrders.filter(o => o.status === 'Done' && !o.clientConfirmed).length;
    
    document.getElementById('waitingCount').textContent = waiting;
    document.getElementById('progressCount').textContent = progress;
    document.getElementById('doneCount').textContent = done;
    
    if (document.getElementById('confirmCount')) {
        document.getElementById('confirmCount').textContent = needConfirmation;
    }
}

// Open Order Form
function openOrderForm(orderId = null) {
    editingOrderId = orderId;
    
    if (orderId) {
        const order = currentOrders.find(o => o.id === orderId);
        document.getElementById('orderFormTitle').textContent = 'Edit Order';
        populateForm(order);
    } else {
        document.getElementById('orderFormTitle').textContent = 'New Order';
        orderForm.reset();
        document.getElementById('formRevisionRemaining').value = 2;
        document.getElementById('invoicePreviewSmall').style.display = 'none';
        currentInvoiceData = null;
    }
    
    orderFormModal.classList.add('show');
}

// Close Order Form
function closeOrderForm() {
    orderFormModal.classList.remove('show');
    orderForm.reset();
    editingOrderId = null;
    currentInvoiceData = null;
}

// Populate Form
function populateForm(order) {
    document.getElementById('formOrderCode').value = order.orderCode || '';
    document.getElementById('formClientName').value = order.clientName || '';
    document.getElementById('formItemName').value = order.itemName || '';
    document.getElementById('formTotalPrice').value = order.totalPrice || '';
    document.getElementById('formPaymentDeadline').value = order.paymentDeadline || '';
    document.getElementById('formDeadline').value = order.deadline || '';
    document.getElementById('formStatus').value = order.status || 'Waiting Payment';
    document.getElementById('formPaymentStatus').value = order.paymentStatus || 'Belum Bayar';
    document.getElementById('formPaymentType').value = order.paymentType || 'dp';
    document.getElementById('formRefundable').value = order.refundable || 'yes';
    document.getElementById('formCurrentStage').value = order.currentStage || '';
    document.getElementById('formRevisionRemaining').value = (order.revisionRemaining != null) ? order.revisionRemaining : 2;
    document.getElementById('formRevisionHistoryFree').value = order.revisionHistoryFree || '';
    document.getElementById('formRevisionHistoryPaid').value = order.revisionHistoryPaid || '';
    document.getElementById('formRevisionCharges').value = order.revisionCharges || 0;
    document.getElementById('formInvoiceVisible').checked = order.invoiceVisible || false;
    document.getElementById('formGDriveLink').value = order.gdriveLink || '';
    
    if (order.invoiceData) {
        currentInvoiceData = order.invoiceData;
        document.getElementById('invoicePreviewSmall').style.display = 'block';
    }
    
    if (order.status === 'Done') {
        document.getElementById('googleDriveSection').style.display = 'block';
    }
}

// Calculate revision charges from paid revision text
function calculateRevisionCharges() {
    const paidText = document.getElementById('formRevisionHistoryPaid').value;
    if (!paidText) return 0;
    
    const matches = paidText.match(/Rp\s?[\d,]+/g);
    if (!matches) return 0;
    
    let total = 0;
    matches.forEach(match => {
        const amount = parseInt(match.replace(/Rp\s?|,/g, ''));
        if (!isNaN(amount)) {
            total += amount;
        }
    });
    
    document.getElementById('formRevisionCharges').value = total;
    return total;
}

// Auto-calculate when paid revision changes
if (document.getElementById('formRevisionHistoryPaid')) {
    document.getElementById('formRevisionHistoryPaid').addEventListener('input', calculateRevisionCharges);
}

// Handle Order Submit
async function handleOrderSubmit(e) {
    e.preventDefault();
    
    console.log('Form submitted!');
    console.log('Firebase ready:', isFirebaseReady);
    console.log('Current invoice data:', currentInvoiceData);
    
    const orderData = {
        orderCode: document.getElementById('formOrderCode').value.toUpperCase(),
        clientName: document.getElementById('formClientName').value,
        itemName: document.getElementById('formItemName').value,
        totalPrice: parseInt(document.getElementById('formTotalPrice').value),
        paymentDeadline: document.getElementById('formPaymentDeadline').value,
        deadline: document.getElementById('formDeadline').value || null,
        status: document.getElementById('formStatus').value,
        paymentStatus: document.getElementById('formPaymentStatus').value,
        paymentType: document.getElementById('formPaymentType').value,
        refundable: document.getElementById('formRefundable').value,
        currentStage: document.getElementById('formCurrentStage').value || '',
        revisionRemaining: parseInt(document.getElementById('formRevisionRemaining').value) || 0,
        revisionHistoryFree: document.getElementById('formRevisionHistoryFree').value || '',
        revisionHistoryPaid: document.getElementById('formRevisionHistoryPaid').value || '',
        revisionCharges: calculateRevisionCharges(),
        revisionAllowed: true,
        revisionStages: ['Sketching', 'Cleaning', 'Rendering'],
        revisionSubjects: ['Pose', 'Ekspresi', 'Warna', 'Detail Minor'],
        updatedAt: new Date().toISOString(),
        gdriveLink: document.getElementById('formGDriveLink').value || null,
        invoiceVisible: document.getElementById('formInvoiceVisible').checked
    };
    
    console.log('Order data prepared:', orderData);
    
    if (currentInvoiceData) {
        orderData.invoiceData = currentInvoiceData;
        console.log('Invoice data added to order');
    }
    
    const progressArtFile = document.getElementById('formProgressArt').files[0];
    
    if (progressArtFile) {
        console.log('Compressing progress art...');
        compressImage(progressArtFile, 800).then(compressed => {
            orderData.progressArt = compressed;
            console.log('Progress art compressed successfully');
            saveOrder(orderData);
        }).catch(err => {
            console.error('Error compressing progress art:', err);
            alert('Gagal compress gambar progress. Silakan coba gambar yang lebih kecil.');
        });
    } else {
        await saveOrder(orderData);
    }
}

// Save Order
async function saveOrder(orderData) {
    console.log('saveOrder called with data:', orderData);
    
    if (!isFirebaseReady) {
        console.log('Using localStorage fallback...');
        if (editingOrderId) {
            const index = currentOrders.findIndex(o => o.id === editingOrderId);
            if (index !== -1) {
                currentOrders[index] = { ...currentOrders[index], ...orderData };
            }
            alert('Order berhasil diupdate (localStorage)!');
        } else {
            orderData.id = 'order_' + Date.now();
            orderData.orderDate = new Date().toISOString().split('T')[0];
            orderData.createdAt = new Date().toISOString();
            currentOrders.push(orderData);
            alert('Order berhasil dibuat (localStorage)!');
        }
        
        localStorage.setItem('orders', JSON.stringify(currentOrders));
        closeOrderForm();
        renderOrders();
        updateStats();
        return;
    }
    
    try {
        if (editingOrderId) {
            console.log('Updating existing order:', editingOrderId);
            await window.firestore.updateDoc(
                window.firestore.doc(window.db, 'orders', editingOrderId),
                orderData
            );
            console.log('Order updated successfully!');
            alert('Order berhasil diupdate!');
        } else {
            console.log('Creating new order...');
            orderData.orderDate = new Date().toISOString().split('T')[0];
            orderData.createdAt = new Date().toISOString();
            
            const docRef = await window.firestore.addDoc(
                window.firestore.collection(window.db, 'orders'),
                orderData
            );
            console.log('Order created successfully with ID:', docRef.id);
            alert('Order berhasil dibuat!');
        }
        
        closeOrderForm();
        await loadOrders();
    } catch (error) {
        console.error('Error saving order:', error);
        console.error('Error details:', error.message, error.code);
        alert('Gagal menyimpan order: ' + error.message + '\n\nCek console untuk detail lebih lanjut.');
    }
}

// Edit Order
function editOrder(orderId) {
    openOrderForm(orderId);
}

// Delete Order
async function deleteOrder(orderId) {
    if (!confirm('Yakin ingin menghapus order ini?')) return;
    
    if (!isFirebaseReady) {
        currentOrders = currentOrders.filter(o => o.id !== orderId);
        localStorage.setItem('orders', JSON.stringify(currentOrders));
        alert('Order berhasil dihapus (localStorage)!');
        renderOrders();
        updateStats();
        return;
    }
    
    try {
        await window.firestore.deleteDoc(
            window.firestore.doc(window.db, 'orders', orderId)
        );
        alert('Order berhasil dihapus!');
        await loadOrders();
    } catch (error) {
        console.error('Error deleting order:', error);
        alert('Gagal menghapus order: ' + error.message);
    }
}

// Invoice Builder Functions
function openInvoiceBuilder() {
    const clientName = document.getElementById('formClientName').value;
    const orderCode = document.getElementById('formOrderCode').value;
    
    if (currentInvoiceData) {
        loadInvoiceData(currentInvoiceData);
    } else {
        invoiceItems = [{
            name: document.getElementById('formItemName').value || '',
            price: parseInt(document.getElementById('formTotalPrice').value) || 0,
            quantity: 1,
            discount: 0
        }];
        document.getElementById('invoiceNumber').value = orderCode || 'INV-001';
        renderInvoiceItems();
    }
    
    invoiceBuilderModal.classList.add('show');
    updateInvoicePreview();
}

function closeInvoiceBuilder() {
    invoiceBuilderModal.classList.remove('show');
}

function addInvoiceItem() {
    invoiceItems.push({
        name: '',
        price: 0,
        quantity: 1,
        discount: 0
    });
    renderInvoiceItems();
}

function removeInvoiceItem(index) {
    invoiceItems.splice(index, 1);
    renderInvoiceItems();
}

function renderInvoiceItems() {
    const container = document.getElementById('invoiceItemsContainer');
    container.innerHTML = '';
    
    invoiceItems.forEach((item, index) => {
        const div = document.createElement('div');
        div.style.cssText = 'background: #f8f9fa; padding: 15px; border-radius: 8px; margin-bottom: 10px; position: relative;';
        div.innerHTML = `
            <button onclick="removeInvoiceItem(${index})" style="position: absolute; top: 10px; right: 10px; background: #ff6b6b; color: white; border: none; padding: 5px 10px; border-radius: 5px; cursor: pointer;">×</button>
            <div class="input-group">
                <label>Nama Item</label>
                <input type="text" value="${item.name}" onchange="invoiceItems[${index}].name = this.value; updateInvoicePreview();">
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                <div class="input-group">
                    <label>Harga</label>
                    <input type="number" value="${item.price}" onchange="invoiceItems[${index}].price = parseInt(this.value) || 0; updateInvoicePreview();">
                </div>
                <div class="input-group">
                    <label>Jumlah</label>
                    <input type="number" value="${item.quantity}" onchange="invoiceItems[${index}].quantity = parseInt(this.value) || 1; updateInvoicePreview();">
                </div>
            </div>
            <div class="input-group">
                <label>Diskon (Rp)</label>
                <input type="number" value="${item.discount}" onchange="invoiceItems[${index}].discount = parseInt(this.value) || 0; updateInvoicePreview();">
            </div>
            <div class="input-group">
                <label>Deskripsi Diskon (opsional)</label>
                <input type="text" value="${item.discountDesc || ''}" placeholder="Contoh: Diskon early bird" onchange="invoiceItems[${index}].discountDesc = this.value; updateInvoicePreview();">
                <small>Akan ditampilkan di bawah nama item jika ada diskon</small>
            </div>
        `;
        container.appendChild(div);
    });
    
    updateInvoicePreview();
}

function updateInvoicePreview() {
    const invoiceNumber = document.getElementById('invoiceNumber').value;
    const clientName = document.getElementById('formClientName').value;
    const paymentMethod = document.getElementById('invoicePaymentMethod').value;
    
    let total = 0;
    const itemsHTML = invoiceItems.map(item => {
        const itemTotal = (item.price * item.quantity) - (item.discount || 0);
        total += itemTotal;
        
        let discountDescHTML = '';
        if (item.discount > 0 && item.discountDesc) {
            discountDescHTML = `<div style="font-size: 12px; color: #666; opacity: 0.8; font-style: italic;">- ${item.discountDesc}</div>`;
        }
        
        const discountNominalHTML = item.discount > 0
            ? `<div style="font-size: 11px; color: #999; opacity: 0.75; margin-top: 2px;">- Rp${item.discount.toLocaleString('id-ID')}</div>`
            : '';

        return `
            <tr>
                <td style="padding: 12px; border-bottom: 1px solid #e0e0e0;">
                    ${item.name}
                    ${discountDescHTML}
                </td>
                <td style="padding: 12px; border-bottom: 1px solid #e0e0e0;">
                    Rp${item.price.toLocaleString('id-ID')}
                    ${discountNominalHTML}
                </td>
                <td style="padding: 12px; border-bottom: 1px solid #e0e0e0; text-align: center;">${item.quantity}</td>
                <td style="padding: 12px; border-bottom: 1px solid #e0e0e0; text-align: right;">Rp${itemTotal.toLocaleString('id-ID')}</td>
            </tr>
        `;
    }).join('');
    
    document.getElementById('invoicePreviewContent').innerHTML = `
        <div style="border-bottom: 3px solid #1e3c72; padding-bottom: 15px; margin-bottom: 20px;">
            <h1 style="color: #1e3c72; font-size: 32px; margin: 0;">INVOICE</h1>
            <div style="color: #666; font-size: 18px;">${invoiceNumber}</div>
        </div>
        
        <div style="margin-bottom: 20px;">
            <strong style="color: #1e3c72;">Kepada:</strong><br>
            <div style="margin-top: 5px;">${clientName || 'Client Name'}</div>
        </div>
        
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
            <thead>
                <tr style="background: #1e3c72; color: white;">
                    <th style="padding: 10px; text-align: left;">Item</th>
                    <th style="padding: 10px; text-align: left;">Harga Satuan</th>
                    <th style="padding: 10px; text-align: center;">Jumlah</th>
                    <th style="padding: 10px; text-align: right;">Total</th>
                </tr>
            </thead>
            <tbody>
                ${itemsHTML}
            </tbody>
        </table>
        
        <div style="text-align: right; margin-top: 20px;">
            <div style="font-size: 20px; font-weight: bold; color: #1e3c72; padding: 15px; background: #f8f9fa; border-radius: 8px;">
                Total: Rp${total.toLocaleString('id-ID')}
            </div>
        </div>
        
        <div style="margin-top: 30px; padding-top: 20px; border-top: 2px solid #e0e0e0;">
            <strong>Pembayaran via: ${paymentMethod}</strong>
        </div>
    `;
}

function saveInvoiceData() {
    const qrisFile = document.getElementById('invoiceQRIS').files[0];
    
    const saveData = () => {
        currentInvoiceData = {
            invoiceNumber: document.getElementById('invoiceNumber').value,
            items: invoiceItems,
            paymentMethod: document.getElementById('invoicePaymentMethod').value,
            qrisImage: window.tempQRISImage || null,
            createdAt: new Date().toISOString()
        };
        
        document.getElementById('invoicePreviewSmall').style.display = 'block';
        closeInvoiceBuilder();
        alert('Invoice berhasil disimpan! Jangan lupa klik "Save" pada form order.');
    };
    
    if (qrisFile) {
        console.log('Compressing QRIS image...');
        compressImage(qrisFile, 300).then(compressed => {
            window.tempQRISImage = compressed;
            console.log('QRIS compressed successfully');
            saveData();
        }).catch(err => {
            console.error('Error compressing QRIS:', err);
            alert('Gagal compress QRIS. Silakan coba gambar yang lebih kecil.');
        });
    } else {
        saveData();
    }
}

function loadInvoiceData(data) {
    document.getElementById('invoiceNumber').value = data.invoiceNumber;
    document.getElementById('invoicePaymentMethod').value = data.paymentMethod;
    invoiceItems = data.items || [];
    renderInvoiceItems();
}

// Utility Functions
function getStatusClass(status) {
    const map = {
        'Waiting Payment': 'status-waiting',
        'In Progress': 'status-progress',
        'On Revision': 'status-revision',
        'Done': 'status-done',
        'Pending': 'status-pending',
        'Canceled': 'status-canceled'
    };
    return map[status] || 'status-pending';
}

function formatCurrency(amount) {
    return 'Rp' + (amount || 0).toLocaleString('id-ID');
}

// Close modals on outside click
orderFormModal.addEventListener('click', (e) => {
    if (e.target === orderFormModal) {
        closeOrderForm();
    }
});

invoiceBuilderModal.addEventListener('click', (e) => {
    if (e.target === invoiceBuilderModal) {
        closeInvoiceBuilder();
    }
});

// Make functions global for onclick handlers
window.editOrder = editOrder;
window.deleteOrder = deleteOrder;
window.addInvoiceItem = addInvoiceItem;
window.removeInvoiceItem = removeInvoiceItem;
window.saveInvoiceData = saveInvoiceData;