
-- Fix profile to HQ
UPDATE public.profiles SET is_hq = true, is_active = true WHERE id = '9e0a5eb0-5052-492b-97ff-a333b7242d43';

-- Assign hq_admin role
INSERT INTO public.user_roles (user_id, role)
VALUES ('9e0a5eb0-5052-492b-97ff-a333b7242d43', 'hq_admin')
ON CONFLICT (user_id, role) DO NOTHING;

-- Grant full access to all modules
DELETE FROM public.user_module_permissions WHERE user_id = '9e0a5eb0-5052-492b-97ff-a333b7242d43';

INSERT INTO public.user_module_permissions (user_id, module_key, access_level) VALUES
('9e0a5eb0-5052-492b-97ff-a333b7242d43', 'dashboard', 'admin'),
('9e0a5eb0-5052-492b-97ff-a333b7242d43', 'clients', 'admin'),
('9e0a5eb0-5052-492b-97ff-a333b7242d43', 'renewals', 'admin'),
('9e0a5eb0-5052-492b-97ff-a333b7242d43', 'pipeline', 'admin'),
('9e0a5eb0-5052-492b-97ff-a333b7242d43', 'deal_registrations', 'admin'),
('9e0a5eb0-5052-492b-97ff-a333b7242d43', 'commissions', 'admin'),
('9e0a5eb0-5052-492b-97ff-a333b7242d43', 'onboarding', 'admin'),
('9e0a5eb0-5052-492b-97ff-a333b7242d43', 'certifications', 'admin'),
('9e0a5eb0-5052-492b-97ff-a333b7242d43', 'knowledge_base', 'admin'),
('9e0a5eb0-5052-492b-97ff-a333b7242d43', 'training', 'admin'),
('9e0a5eb0-5052-492b-97ff-a333b7242d43', 'announcements', 'admin'),
('9e0a5eb0-5052-492b-97ff-a333b7242d43', 'community', 'admin'),
('9e0a5eb0-5052-492b-97ff-a333b7242d43', 'settings', 'admin');
