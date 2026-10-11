import React, { useState } from 'react';
import JSZip from 'jszip';

interface WebsiteEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onToast: (msg: string) => void;
}

export const WebsiteEditorModal: React.FC<WebsiteEditorModalProps> = ({
  isOpen,
  onClose,
  onToast,
}) => {
  // Settings Data
  const [settings, setSettings] = useState({
    title: 'Krueger Painting',
    phone: '(262) 123-4567',
    email: 'josh@kruegerpaintingwi.com',
    businessHours: 'Mon - Fri: 8am - 5pm',
    socials: {
      facebook: '',
      instagram: '',
    },
  });

  // Hero Data
  const [hero, setHero] = useState({
    headline: 'Master Painting & Restoration',
    subheadline: 'Serving West Bend & Surrounding Areas',
    ctaText: 'Get a Free Estimate',
    heroImageName: 'hero-bg.jpg',
  });
  const [heroImageFile, setHeroImageFile] = useState<File | null>(null);

  // Services Data
  const [services, setServices] = useState([
    {
      id: 'interior',
      title: 'Interior Painting',
      description: 'Full room repaints, trim work, and detailed surface prep.',
      imageName: 'service-interior.jpg',
      imageFile: null as File | null,
    },
    {
      id: 'exterior',
      title: 'Exterior Painting',
      description: 'Weather-resistant coatings for siding, decks, and fences.',
      imageName: 'service-exterior.jpg',
      imageFile: null as File | null,
    },
  ]);

  // Gallery Data
  const [gallery, setGallery] = useState<{ id: string; imageName: string; title: string; imageFile: File | null }[]>([]);

  if (!isOpen) return null;

  const handleSettingsChange = (field: string, value: string) => {
    setSettings((prev) => ({ ...prev, [field]: value }));
  };

  const handleHeroChange = (field: string, value: string) => {
    setHero((prev) => ({ ...prev, [field]: value }));
  };

  const handleHeroImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setHeroImageFile(file);
      handleHeroChange('heroImageName', file.name);
    }
  };

  const handleServiceChange = (index: number, field: string, value: string) => {
    const newServices = [...services];
    newServices[index] = { ...newServices[index], [field]: value };
    setServices(newServices);
  };

  const handleServiceImageUpload = (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const newServices = [...services];
      newServices[index].imageFile = file;
      newServices[index].imageName = file.name;
      setServices(newServices);
    }
  };

  const handleAddGalleryItem = () => {
    setGallery([...gallery, { id: Date.now().toString(), imageName: '', title: '', imageFile: null }]);
  };

  const handleGalleryChange = (index: number, field: string, value: string) => {
    const newGallery = [...gallery];
    newGallery[index] = { ...newGallery[index], [field]: value };
    setGallery(newGallery);
  };

  const handleGalleryImageUpload = (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const newGallery = [...gallery];
      newGallery[index].imageFile = file;
      newGallery[index].imageName = file.name;
      setGallery(newGallery);
    }
  };

  const handleRemoveGalleryItem = (index: number) => {
    const newGallery = [...gallery];
    newGallery.splice(index, 1);
    setGallery(newGallery);
  };

  const handleExport = async () => {
    try {
      const zip = new JSZip();

      // Folders
      const dataFolder = zip.folder('data');
      const imgFolder = zip.folder('images');
      const galleryImgFolder = zip.folder('images/gallery');

      if (!dataFolder || !imgFolder || !galleryImgFolder) throw new Error('Could not create zip folders');

      // Add JSON Data
      dataFolder.file('settings.json', JSON.stringify(settings, null, 2));

      const heroExport = { ...hero };
      dataFolder.file('hero.json', JSON.stringify(heroExport, null, 2));

      const servicesExport = services.map(s => ({ id: s.id, title: s.title, description: s.description, imageName: s.imageName }));
      dataFolder.file('services.json', JSON.stringify(servicesExport, null, 2));

      const galleryExport = gallery.map(g => ({ id: g.id, title: g.title, imageName: g.imageName }));
      dataFolder.file('gallery.json', JSON.stringify(galleryExport, null, 2));

      // Add Images
      if (heroImageFile) {
        imgFolder.file(heroImageFile.name, heroImageFile);
      }

      services.forEach(s => {
        if (s.imageFile) {
          imgFolder.file(s.imageFile.name, s.imageFile);
        }
      });

      gallery.forEach(g => {
        if (g.imageFile) {
          galleryImgFolder.file(g.imageFile.name, g.imageFile);
        }
      });

      // Generate Zip
      const content = await zip.generateAsync({ type: 'blob' });

      // Download
      const link = document.createElement('a');
      link.href = URL.createObjectURL(content);
      link.download = 'krueger-website-export.zip';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      onToast('Website data exported successfully!');
      onClose();
    } catch (err) {
      console.error(err);
      onToast('Failed to export website data.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
      <div className="bg-[var(--surface)] w-full max-w-4xl max-h-[90vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-[var(--border)]">
        <div className="p-4 border-b border-[var(--border)] flex justify-between items-center bg-[var(--surface-subtle)] shrink-0">
          <h2 className="text-xl font-black text-[var(--accent)] flex items-center gap-2">
            <span>🌐</span> Website Editor
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-[var(--bg)] border border-[var(--border)] flex items-center justify-center font-bold text-[var(--text-muted)] hover:text-[var(--text)] transition-colors cursor-pointer"
          >
            ✕
          </button>
        </div>

        <div className="p-4 sm:p-6 overflow-y-auto space-y-8 flex-1 custom-scrollbar text-sm">
          {/* Settings Section */}
          <section className="space-y-4">
            <h3 className="font-bold text-lg text-[var(--text)] border-b border-[var(--border)] pb-2">Global Settings</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-[var(--text-muted)] mb-1">Site Title</label>
                <input
                  type="text"
                  value={settings.title}
                  onChange={(e) => handleSettingsChange('title', e.target.value)}
                  className="w-full bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] rounded-lg px-3 py-2 outline-none focus:border-[var(--accent)]"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-[var(--text-muted)] mb-1">Phone Number</label>
                <input
                  type="text"
                  value={settings.phone}
                  onChange={(e) => handleSettingsChange('phone', e.target.value)}
                  className="w-full bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] rounded-lg px-3 py-2 outline-none focus:border-[var(--accent)]"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-[var(--text-muted)] mb-1">Email</label>
                <input
                  type="text"
                  value={settings.email}
                  onChange={(e) => handleSettingsChange('email', e.target.value)}
                  className="w-full bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] rounded-lg px-3 py-2 outline-none focus:border-[var(--accent)]"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-[var(--text-muted)] mb-1">Business Hours</label>
                <input
                  type="text"
                  value={settings.businessHours}
                  onChange={(e) => handleSettingsChange('businessHours', e.target.value)}
                  className="w-full bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] rounded-lg px-3 py-2 outline-none focus:border-[var(--accent)]"
                />
              </div>
            </div>
          </section>

          {/* Hero Section */}
          <section className="space-y-4">
            <h3 className="font-bold text-lg text-[var(--text)] border-b border-[var(--border)] pb-2">Hero Section</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-[var(--text-muted)] mb-1">Headline</label>
                <input
                  type="text"
                  value={hero.headline}
                  onChange={(e) => handleHeroChange('headline', e.target.value)}
                  className="w-full bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] rounded-lg px-3 py-2 outline-none focus:border-[var(--accent)]"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-[var(--text-muted)] mb-1">Subheadline</label>
                <input
                  type="text"
                  value={hero.subheadline}
                  onChange={(e) => handleHeroChange('subheadline', e.target.value)}
                  className="w-full bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] rounded-lg px-3 py-2 outline-none focus:border-[var(--accent)]"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-[var(--text-muted)] mb-1">CTA Text</label>
                <input
                  type="text"
                  value={hero.ctaText}
                  onChange={(e) => handleHeroChange('ctaText', e.target.value)}
                  className="w-full bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] rounded-lg px-3 py-2 outline-none focus:border-[var(--accent)]"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-[var(--text-muted)] mb-1">Hero Background Image</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleHeroImageUpload}
                  className="w-full bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] rounded-lg px-3 py-1.5 outline-none text-xs file:mr-4 file:py-1 file:px-3 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-[var(--accent)] file:text-white hover:file:bg-opacity-80"
                />
                <p className="text-[10px] text-[var(--text-muted)] mt-1">Current: {hero.heroImageName}</p>
              </div>
            </div>
          </section>

          {/* Services Section */}
          <section className="space-y-4">
            <h3 className="font-bold text-lg text-[var(--text)] border-b border-[var(--border)] pb-2">Services</h3>
            <div className="space-y-4">
              {services.map((service, index) => (
                <div key={service.id} className="p-4 bg-[var(--bg)] border border-[var(--border)] rounded-xl space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-[var(--text-muted)] mb-1">Service Title</label>
                      <input
                        type="text"
                        value={service.title}
                        onChange={(e) => handleServiceChange(index, 'title', e.target.value)}
                        className="w-full bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] rounded-lg px-3 py-2 outline-none focus:border-[var(--accent)]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-[var(--text-muted)] mb-1">Service Image</label>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => handleServiceImageUpload(index, e)}
                        className="w-full bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] rounded-lg px-3 py-1.5 outline-none text-xs file:mr-4 file:py-1 file:px-3 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-[var(--accent)] file:text-white hover:file:bg-opacity-80"
                      />
                      <p className="text-[10px] text-[var(--text-muted)] mt-1">Current: {service.imageName}</p>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[var(--text-muted)] mb-1">Description</label>
                    <textarea
                      value={service.description}
                      onChange={(e) => handleServiceChange(index, 'description', e.target.value)}
                      className="w-full bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] rounded-lg px-3 py-2 outline-none focus:border-[var(--accent)] resize-y min-h-[60px]"
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Gallery Section */}
          <section className="space-y-4">
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-2">
              <h3 className="font-bold text-lg text-[var(--text)]">Photo Gallery</h3>
              <button
                type="button"
                onClick={handleAddGalleryItem}
                className="px-3 py-1 bg-[var(--surface-subtle)] text-[var(--text)] text-xs font-bold rounded-lg border border-[var(--border)] hover:border-[var(--accent)]"
              >
                + Add Photo
              </button>
            </div>

            {gallery.length === 0 ? (
              <p className="text-sm text-[var(--text-muted)] italic text-center py-4">No photos in gallery. Add some!</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {gallery.map((item, index) => (
                  <div key={item.id} className="p-3 bg-[var(--bg)] border border-[var(--border)] rounded-xl relative group">
                    <button
                      type="button"
                      onClick={() => handleRemoveGalleryItem(index)}
                      className="absolute top-2 right-2 w-6 h-6 bg-red-500/20 text-red-500 rounded-full flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Remove"
                    >
                      ✕
                    </button>
                    <div className="space-y-2 mt-2">
                      <div>
                        <label className="block text-[10px] font-bold text-[var(--text-muted)] mb-1">Title/Caption</label>
                        <input
                          type="text"
                          value={item.title}
                          onChange={(e) => handleGalleryChange(index, 'title', e.target.value)}
                          className="w-full bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] rounded-md px-2 py-1 outline-none focus:border-[var(--accent)] text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-[var(--text-muted)] mb-1">Image</label>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => handleGalleryImageUpload(index, e)}
                          className="w-full bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] rounded-md px-2 py-1 outline-none text-[10px] file:mr-2 file:py-0.5 file:px-2 file:rounded file:border-0 file:font-semibold file:bg-[var(--accent)] file:text-white"
                        />
                        {item.imageName && <p className="text-[9px] text-[var(--text-muted)] mt-1 truncate">File: {item.imageName}</p>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        <div className="p-4 border-t border-[var(--border)] bg-[var(--surface-subtle)] shrink-0 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg font-bold text-sm text-[var(--text)] hover:bg-[var(--bg)] transition-colors border border-transparent hover:border-[var(--border)]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleExport}
            className="px-6 py-2 rounded-lg font-black text-sm bg-gradient-to-r from-blue-500 to-indigo-600 text-white shadow-lg hover:scale-105 active:scale-95 transition-all flex items-center gap-2"
          >
            <span>📦</span>
            <span>Export Website Data (ZIP)</span>
          </button>
        </div>
      </div>
    </div>
  );
};
