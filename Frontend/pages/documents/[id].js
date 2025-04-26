// frontend/pages/documents/[id].js
import { useRouter } from 'next/router';
import { useState, useEffect } from 'react';

export default function DocumentDetail() {
  const router = useRouter();
  const { id } = router.query;
  const [content, setContent] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (id) {
      const fetchDocumentContent = async () => {
        try {
          const res = await fetch(`/api/documents/${id}/content`);
          if (!res.ok) {
            throw new Error('Error fetching document content');
          }
          const data = await res.json();
          setContent(data.content);
        } catch (err) {
          setError(err.message);
          setContent(null);
        }
      };

      fetchDocumentContent();
    }
  }, [id]);

  return (
    <div>
      <h1>Document Detail</h1>
      {content ? (
        <pre>{content}</pre>
      ) : (
        <p>{error || 'Loading document content...'}</p>
      )}
    </div>
  );
}