import React, { useState, useEffect } from 'react';
import { fetchSignedPdfs, downloadSignedPdf } from '../lib/api';

const SignedPdfsPage = () => {
    const [signedPdfs, setSignedPdfs] = useState([]);
    const [selectedUser, setSelectedUser] = useState('');

    useEffect(() => {
        fetchSignedPdfs(selectedUser).then(setSignedPdfs);
    }, [selectedUser]);

    const handleDownload = (pdfId) => {
        downloadSignedPdf(pdfId);
    };

    return (
        <div>
            <h1>Signed PDFs</h1>
            <label>
                Filter by User ID:
                <input
                    type="text"
                    value={selectedUser}
                    onChange={(e) => setSelectedUser(e.target.value)}
                />
            </label>
            <ul>
                {signedPdfs.map((pdf) => (
                    <li key={pdf.id}>
                        {pdf.user_id} - {pdf.month} - {new Date(pdf.signed_at).toLocaleString()}
                        <button onClick={() => handleDownload(pdf.id)}>Download</button>
                    </li>
                ))}
            </ul>
        </div>
    );
};

export default SignedPdfsPage;