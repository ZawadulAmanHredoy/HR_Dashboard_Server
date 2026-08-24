import { supabase } from "../lib/supabase.js";
import * as seed from "../data/seed.js";

const TABLE = "profiles";
const AVATAR_BUCKET = "profile-avatars";

const ALLOWED_AVATAR_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

/** Uploaded avatars live in storage — never clobber them with the Google one. */
function isUploadedAvatar(url) {
  return Boolean(url && url.includes("/storage/v1/object/public/profile-avatars/"));
}

/** Demo-mode profile, mutated in memory until a real project is connected. */
let memoryProfile = { ...seed.profile };

function initials(name) {
  return name
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

/** "Forhad Hossain" -> "Forhad H..." (matches the topbar treatment) */
function shortName(name) {
  const [first, second] = name.split(" ").filter(Boolean);
  if (!first) return name;
  return second ? `${first} ${second[0]}...` : first;
}

function toApi(row) {
  return {
    id: row.id,
    name: row.full_name,
    shortName: row.short_name ?? shortName(row.full_name),
    role: row.role ?? "Career Consultant",
    email: row.email,
    phone: row.phone ?? "",
    timezone: row.timezone ?? "GMT+6",
    bio: row.bio ?? "",
    skills: row.skills ?? [],
    avatarUrl: row.avatar_url ?? null,
    // Mentor-listing fields — published consultants appear on the client app.
    pricePerSession: row.price_per_session ?? null,
    currency: row.currency ?? "BDT",
    isPublished: row.is_published ?? false,
    initials: initials(row.full_name),

    // Contact information
    username: row.username ?? "",
    dateOfBirth: row.date_of_birth ?? "",
    yearsExperience: row.years_experience ?? null,
    department: row.department ?? "",
    designation: row.designation ?? "",
    nidNumber: row.nid_number ?? "",
    languages: row.languages ?? [],
    bloodGroup: row.blood_group ?? "",
    gender: row.gender ?? "",
    featureOnWebsite: row.feature_on_website ?? false,

    // Address information
    addressLine1: row.address_line1 ?? "",
    addressLine2: row.address_line2 ?? "",
    country: row.country ?? "",
    city: row.city ?? "",
    state: row.state ?? "",
    postcode: row.postcode ?? "",

    // Appointment information
    appointmentType: row.appointment_type ?? "Online Consultation",
    onlineConsultEnabled: row.online_consult_enabled ?? true,
    advanceBookingDays: row.advance_booking_days ?? null,
    appointmentDurationMinutes: row.appointment_duration_minutes ?? 60,
    maxBookingsPerSlot: row.max_bookings_per_slot ?? 1,

    // Repeating sections
    education: row.education ?? [],
    awards: row.awards ?? [],
    certifications: row.certifications ?? [],
  };
}

/** Repeating sections are stored as jsonb arrays with a fixed shape. */
function sanitizeList(value, fields, limit = 20) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, limit).map((item) => {
    const clean = {};
    for (const field of fields) {
      const raw = item?.[field];
      clean[field] = raw === undefined || raw === null ? "" : String(raw).slice(0, 200);
    }
    return clean;
  });
}

/** First row created for a consultant, seeded from their Google account. */
function newProfileRow(user) {
  const name = user.name || user.email;
  return {
    id: user.id,
    full_name: name,
    short_name: shortName(name),
    role: "Career Consultant",
    email: user.email,
    phone: "",
    timezone: "GMT+6",
    bio: "",
    skills: [],
    avatar_url: user.avatarUrl,
    provider: user.provider,
  };
}

export async function getProfile(user) {
  if (!supabase) return toApi(memoryProfile);

  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .eq("id", user.id)
    .maybeSingle();
  if (error) throw Object.assign(new Error(error.message), { status: 502 });

  if (data) {
    // Keep the Google avatar fresh without overwriting edited fields — or an
    // uploaded picture (see uploadAvatar below).
    if (
      user.avatarUrl &&
      user.avatarUrl !== data.avatar_url &&
      !isUploadedAvatar(data.avatar_url)
    ) {
      const { data: updated } = await supabase
        .from(TABLE)
        .update({ avatar_url: user.avatarUrl })
        .eq("id", user.id)
        .select()
        .single();
      return toApi(updated ?? { ...data, avatar_url: user.avatarUrl });
    }
    return toApi(data);
  }

  const { data: created, error: insertError } = await supabase
    .from(TABLE)
    .insert(newProfileRow(user))
    .select()
    .single();
  if (insertError) {
    throw Object.assign(new Error(insertError.message), { status: 502 });
  }

  return toApi(created);
}

export async function updateProfile(user, patch) {
  const changes = {};
  if (patch.name !== undefined) {
    changes.full_name = patch.name;
    changes.short_name = shortName(patch.name);
  }
  if (patch.email !== undefined) changes.email = patch.email;
  if (patch.phone !== undefined) changes.phone = patch.phone;
  if (patch.timezone !== undefined) changes.timezone = patch.timezone;
  if (patch.bio !== undefined) changes.bio = patch.bio;
  if (patch.skills !== undefined) changes.skills = patch.skills;
  // Mentor-listing fields.
  if (patch.pricePerSession !== undefined) {
    const price = Number(patch.pricePerSession);
    changes.price_per_session =
      patch.pricePerSession === null || patch.pricePerSession === "" || Number.isNaN(price)
        ? null
        : price;
  }
  if (patch.currency !== undefined) changes.currency = patch.currency;
  if (patch.isPublished !== undefined) changes.is_published = Boolean(patch.isPublished);

  // Contact information
  if (patch.username !== undefined) changes.username = patch.username;
  if (patch.role !== undefined) changes.role = patch.role;
  if (patch.dateOfBirth !== undefined) changes.date_of_birth = patch.dateOfBirth || null;
  if (patch.department !== undefined) changes.department = patch.department;
  if (patch.designation !== undefined) changes.designation = patch.designation;
  if (patch.nidNumber !== undefined) changes.nid_number = patch.nidNumber;
  if (patch.bloodGroup !== undefined) changes.blood_group = patch.bloodGroup;
  if (patch.gender !== undefined) changes.gender = patch.gender;
  if (patch.languages !== undefined) {
    changes.languages = Array.isArray(patch.languages)
      ? patch.languages.map((l) => String(l).slice(0, 40)).slice(0, 20)
      : [];
  }
  if (patch.featureOnWebsite !== undefined) {
    changes.feature_on_website = Boolean(patch.featureOnWebsite);
  }

  // Address information
  if (patch.addressLine1 !== undefined) changes.address_line1 = patch.addressLine1;
  if (patch.addressLine2 !== undefined) changes.address_line2 = patch.addressLine2;
  if (patch.country !== undefined) changes.country = patch.country;
  if (patch.city !== undefined) changes.city = patch.city;
  if (patch.state !== undefined) changes.state = patch.state;
  if (patch.postcode !== undefined) changes.postcode = patch.postcode;

  // Appointment information
  if (patch.appointmentType !== undefined) changes.appointment_type = patch.appointmentType;
  if (patch.onlineConsultEnabled !== undefined) {
    changes.online_consult_enabled = Boolean(patch.onlineConsultEnabled);
  }
  for (const [key, column, min, max] of [
    ["yearsExperience", "years_experience", 0, 80],
    ["advanceBookingDays", "advance_booking_days", 0, 365],
    ["appointmentDurationMinutes", "appointment_duration_minutes", 5, 480],
    ["maxBookingsPerSlot", "max_bookings_per_slot", 1, 50],
  ]) {
    if (patch[key] === undefined) continue;
    const value = Number(patch[key]);
    if (patch[key] === null || patch[key] === "" || Number.isNaN(value)) {
      changes[column] = null;
    } else {
      changes[column] = Math.min(Math.max(Math.round(value), min), max);
    }
  }

  // Repeating sections
  if (patch.education !== undefined) {
    changes.education = sanitizeList(patch.education, ["degree", "university", "from", "to"]);
  }
  if (patch.awards !== undefined) {
    changes.awards = sanitizeList(patch.awards, ["name", "date"]);
  }
  if (patch.certifications !== undefined) {
    changes.certifications = sanitizeList(patch.certifications, ["name", "date"]);
  }

  if (!supabase) {
    memoryProfile = { ...memoryProfile, ...changes };
    return toApi(memoryProfile);
  }

  // Make sure the row exists before patching it (first login can edit straight away).
  await getProfile(user);

  const { data, error } = await supabase
    .from(TABLE)
    .update(changes)
    .eq("id", user.id)
    .select()
    .single();
  if (error) throw Object.assign(new Error(error.message), { status: 502 });

  return toApi(data);
}

/**
 * Stores an uploaded profile picture in the public avatar bucket (same one the
 * client app uses) and points the consultant's profile at it.
 */
export async function uploadAvatar({ user, file }) {
  if (!supabase) {
    throw Object.assign(new Error("Supabase is not configured"), { status: 503 });
  }
  const ext = ALLOWED_AVATAR_TYPES[file?.mimetype];
  if (!ext) {
    throw Object.assign(
      new Error("Only JPG, PNG or WebP images are allowed."),
      { status: 400 },
    );
  }
  if (file.size > MAX_AVATAR_BYTES) {
    throw Object.assign(new Error("Image must be 2 MB or smaller."), { status: 400 });
  }

  await getProfile(user); // make sure the row exists

  const path = `${user.id}/${Date.now()}.${ext}`;
  // Multer memoryStorage hands us a Buffer — pass it straight through.
  const { error: uploadError } = await supabase.storage
    .from(AVATAR_BUCKET)
    .upload(path, file.buffer, {
      contentType: file.mimetype,
      upsert: true,
    });
  if (uploadError) {
    throw Object.assign(new Error(uploadError.message), { status: 502 });
  }

  const { data } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);

  const { data: updated, error: updateError } = await supabase
    .from(TABLE)
    .update({ avatar_url: data.publicUrl })
    .eq("id", user.id)
    .select()
    .single();
  if (updateError) {
    throw Object.assign(new Error(updateError.message), { status: 502 });
  }

  return { url: data.publicUrl, profile: toApi(updated) };
}
